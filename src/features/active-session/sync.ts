import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { runCompletedSessionHook } from "./completed-hook";
import { getDB } from "./db";
import {
  ActiveSessionConflictError,
  isAllClean,
  pushAll,
  runPendingHooks,
  type EngineRemote,
  type EngineStorage,
} from "./engine-core";

type Client = SupabaseClient<Database, "gymstats">;

export type SyncStatus = "saved" | "saving" | "offline" | "error";

type Listener = (status: SyncStatus) => void;

const DEBOUNCE_MS = 2000;
const MAX_BACKOFF_MS = 30000;
const BASE_BACKOFF_MS = 1000;

/** Adaptador Dexie del storage del motor. */
function createDexieStorage(): EngineStorage {
  return {
    async getPendingSessions() {
      return getDB().localSessions.toArray();
    },
    async getDirtySets(sessionId) {
      return getDB()
        .localSets.where({ session_id: sessionId, dirty: 1 })
        .toArray();
    },
    async getSets(sessionId) {
      return getDB().localSets.where("session_id").equals(sessionId).toArray();
    },
    async markSessionPushed(sessionId) {
      await getDB().localSessions.update(sessionId, {
        syncedInsert: 1,
        dirty: 0,
      });
    },
    async markSetsClean(setIds) {
      const db = getDB();
      await db.transaction("rw", db.localSets, async () => {
        for (const id of setIds) {
          await db.localSets.update(id, { dirty: 0 });
        }
      });
    },
    async clearPendingHook(sessionId) {
      await getDB().localSessions.update(sessionId, {
        pendingCompletedHook: 0,
      });
    },
    async deleteSessionAndSets(sessionId) {
      const db = getDB();
      await db.transaction("rw", db.localSessions, db.localSets, async () => {
        await db.localSets.where("session_id").equals(sessionId).delete();
        await db.localSessions.delete(sessionId);
      });
    },
  };
}

/** Adaptador Supabase del remoto del motor. */
export function createSupabaseRemote(supabase: Client): EngineRemote {
  return {
    async upsertSession(payload) {
      const { error } = await supabase
        .from("workout_sessions")
        .upsert(payload, { onConflict: "id" });
      if (error) {
        // 23505 = unique_violation: choque con el índice "una activa por
        // usuario". Se marca para que el motor se autorrecupere.
        if (error.code === "23505") {
          throw new ActiveSessionConflictError(error.message);
        }
        throw error;
      }
    },
    async upsertSets(payload) {
      const { error } = await supabase
        .from("session_sets")
        .upsert(payload, { onConflict: "id" });
      if (error) throw error;
    },
    async discardOtherActiveSessions(userId, keepSessionId) {
      // Descarta las demás activas del usuario (RLS ya limita al usuario; el
      // .eq("user_id") lo deja explícito). Libera la huérfana antes del retry.
      const { error } = await supabase
        .from("workout_sessions")
        .update({ status: "discarded" })
        .eq("user_id", userId)
        .eq("status", "active")
        .neq("id", keepSessionId);
      if (error) throw error;
    },
  };
}

/**
 * Scheduler de sincronización local-first. Único por pestaña.
 * - schedule(): debounce ~2s tras el último cambio.
 * - flush(): ciclo inmediato; resuelve true si todo quedó limpio.
 * - tras cada push limpio ejecuta los hooks de cierre pendientes y borra de
 *   local las sesiones terminadas.
 * - reintentos con backoff exponencial y reintento al evento `online`.
 */
class SyncEngine {
  private supabase: Client | null = null;
  private storage: EngineStorage = createDexieStorage();
  private status: SyncStatus = "saved";
  private listeners = new Set<Listener>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private onlineBound = false;
  /** Serializa los ciclos de sync (nunca dos push simultáneos). */
  private queue: Promise<unknown> = Promise.resolve();

  init(supabase: Client) {
    this.supabase = supabase;
    if (typeof window !== "undefined" && !this.onlineBound) {
      this.onlineBound = true;
      window.addEventListener("online", () => {
        // Al reconectar, reintenta inmediatamente (push + hooks pendientes).
        void this.runCycle();
      });
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  private setStatus(status: SyncStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const l of this.listeners) l(status);
  }

  /** Programa una sincronización con debounce tras el último cambio. */
  schedule() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.runCycle();
    }, DEBOUNCE_MS);
  }

  /**
   * Fuerza un ciclo inmediato (push + hooks). Devuelve true si todo quedó
   * limpio (volcado y hooks ejecutados); false si offline o fallo — en ese
   * caso el backoff / listener `online` seguirá reintentando en segundo plano.
   */
  async flush(): Promise<boolean> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
    return this.runCycle();
  }

  /** Encola un ciclo de sync serializado. */
  private runCycle(): Promise<boolean> {
    const next = this.queue.then(
      () => this.doCycle(),
      () => this.doCycle(),
    );
    this.queue = next.catch(() => false);
    return next;
  }

  private async doCycle(): Promise<boolean> {
    if (!this.supabase) return false;
    const offline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline) {
      const clean = await isAllClean(this.storage);
      this.setStatus(clean ? "saved" : "offline");
      return clean;
    }
    this.setStatus("saving");
    const remote = createSupabaseRemote(this.supabase);
    try {
      await pushAll(this.storage, remote);
      await runPendingHooks(this.storage, (session, sets) =>
        runCompletedSessionHook(this.supabase!, session, sets),
      );
    } catch {
      this.scheduleBackoff();
      return false;
    }
    const clean = await isAllClean(this.storage);
    if (clean) {
      this.attempt = 0;
      this.setStatus("saved");
      return true;
    }
    // Quedó trabajo (p.ej. cambios llegados durante el push): otro ciclo.
    this.schedule();
    return false;
  }

  private scheduleBackoff() {
    // Si nos quedamos offline, el evento `online` reintentará.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.setStatus("offline");
      return;
    }
    this.setStatus("error");
    const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** this.attempt);
    this.attempt += 1;
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      void this.runCycle();
    }, delay);
  }

  /** Limpia timers y estado del indicador. NO toca datos locales. */
  reset() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    this.debounceTimer = null;
    this.backoffTimer = null;
    this.attempt = 0;
    this.setStatus("saved");
  }
}

// Singleton por pestaña.
let _engine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  if (!_engine) _engine = new SyncEngine();
  return _engine;
}
