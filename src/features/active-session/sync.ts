import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { getDB, type LocalSession } from "./db";
import { selectSetsToSync, type LocalSet } from "./logic";

type Client = SupabaseClient<Database>;

export type SyncStatus = "saved" | "saving" | "offline" | "error";

type Listener = (status: SyncStatus) => void;

const DEBOUNCE_MS = 2000;
const MAX_BACKOFF_MS = 30000;
const BASE_BACKOFF_MS = 1000;

/**
 * Scheduler de sincronización local-first. Único por pestaña.
 * - schedule(): debounce ~2s tras el último cambio.
 * - flush(): fuerza envío inmediato y resuelve cuando todo está limpio.
 * - estado observable para el indicador de UI.
 */
class SyncEngine {
  private supabase: Client | null = null;
  private status: SyncStatus = "saved";
  private listeners = new Set<Listener>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private running = false;
  private rerunRequested = false;
  private onlineHandler: (() => void) | null = null;
  /** Promesas a resolver cuando el ciclo de sync deje todo limpio. */
  private flushWaiters: Array<() => void> = [];

  init(supabase: Client) {
    this.supabase = supabase;
    if (typeof window !== "undefined" && !this.onlineHandler) {
      this.onlineHandler = () => {
        // Al reconectar, reintenta inmediatamente.
        this.run();
      };
      window.addEventListener("online", this.onlineHandler);
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
      this.run();
    }, DEBOUNCE_MS);
  }

  /**
   * Fuerza el envío inmediato y resuelve cuando no quede nada dirty.
   * Se usa al terminar el entrenamiento.
   */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
    if (await this.isClean()) {
      this.setStatus("saved");
      return;
    }
    const promise = new Promise<void>((resolve) => {
      this.flushWaiters.push(resolve);
    });
    this.run();
    return promise;
  }

  private async isClean(): Promise<boolean> {
    const db = getDB();
    const session = await this.getActiveSession();
    if (!session) return true;
    // Sesión pendiente de insertar o dirty.
    if (session.syncedInsert === 0 || session.dirty === 1) return false;
    const dirtySets = await db.localSets
      .where({ session_id: session.id, dirty: 1 })
      .toArray();
    // Solo cuentan los no vacíos (los vacíos nunca se envían).
    const pending = selectSetsToSync(dirtySets);
    return pending.length === 0;
  }

  private async getActiveSession(): Promise<LocalSession | undefined> {
    const db = getDB();
    return db.localSessions.where("status").equals("active").first();
  }

  private resolveFlushWaiters() {
    const waiters = this.flushWaiters;
    this.flushWaiters = [];
    for (const w of waiters) w();
  }

  /** Ejecuta un ciclo de sincronización (con reentrada segura). */
  private run() {
    if (this.running) {
      this.rerunRequested = true;
      return;
    }
    void this.execute();
  }

  private async execute() {
    if (!this.supabase) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.setStatus("offline");
      return;
    }
    this.running = true;
    this.setStatus("saving");
    try {
      const ok = await this.pushOnce();
      this.running = false;
      if (!ok) {
        this.scheduleBackoff();
        return;
      }
      this.attempt = 0;
      if (this.rerunRequested) {
        this.rerunRequested = false;
        this.run();
        return;
      }
      if (await this.isClean()) {
        this.setStatus("saved");
        this.resolveFlushWaiters();
      } else {
        // Algo quedó dirty (p.ej. cambios llegados durante el push): reintenta.
        this.run();
      }
    } catch {
      this.running = false;
      this.setStatus("error");
      this.scheduleBackoff();
    }
  }

  private scheduleBackoff() {
    // Si estamos offline, no reintentes por timer: el evento `online` lo hará.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.setStatus("offline");
      return;
    }
    this.setStatus("error");
    const delay = Math.min(
      MAX_BACKOFF_MS,
      BASE_BACKOFF_MS * 2 ** this.attempt,
    );
    this.attempt += 1;
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      this.run();
    }, delay);
  }

  /**
   * Un intento de push: inserta/upserta la sesión y upserta los sets dirty.
   * Devuelve true si todo fue bien.
   */
  private async pushOnce(): Promise<boolean> {
    if (!this.supabase) return false;
    const db = getDB();
    const session = await this.getActiveSession();
    if (!session) return true;

    // 1) Upsert de la sesión (insert o cambios).
    if (session.syncedInsert === 0 || session.dirty === 1) {
      const { error } = await this.supabase.from("workout_sessions").upsert(
        {
          id: session.id,
          user_id: session.user_id,
          template_id: session.template_id,
          block_id: session.block_id,
          performed_on: session.performed_on,
          notes: session.notes,
          status: session.status,
          started_at: session.started_at,
        },
        { onConflict: "id" },
      );
      if (error) throw error;
      await db.localSessions.update(session.id, {
        syncedInsert: 1,
        dirty: 0,
      });
    }

    // 2) Upsert batch de sets dirty no vacíos.
    const dirtySets = await db.localSets
      .where({ session_id: session.id, dirty: 1 })
      .toArray();
    const payload = selectSetsToSync(dirtySets);
    if (payload.length > 0) {
      const { error } = await this.supabase
        .from("session_sets")
        .upsert(payload, { onConflict: "id" });
      if (error) throw error;
    }
    // Marca clean todos los dirty (incluidos los vacíos que no se envían:
    // dejan de estar dirty hasta que el usuario vuelva a tocarlos).
    const syncedIds = new Set(payload.map((p) => p.id));
    const emptyIds = dirtySets
      .filter((s) => !syncedIds.has(s.id))
      .map((s) => s.id);
    await db.transaction("rw", db.localSets, async () => {
      for (const id of syncedIds) {
        await db.localSets.update(id, { dirty: 0 });
      }
      for (const id of emptyIds) {
        await db.localSets.update(id, { dirty: 0 });
      }
    });
    return true;
  }

  /** Marca la sesión como dirty (para su próxima sincronización). */
  async markSessionDirty(sessionId: string) {
    await getDB().localSessions.update(sessionId, { dirty: 1 });
  }

  /** Limpia timers y estado (al descartar/terminar o desmontar). */
  reset() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    this.debounceTimer = null;
    this.backoffTimer = null;
    this.attempt = 0;
    this.running = false;
    this.rerunRequested = false;
    this.resolveFlushWaiters();
    this.setStatus("saved");
  }
}

// Singleton por pestaña.
let _engine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  if (!_engine) _engine = new SyncEngine();
  return _engine;
}

export type { LocalSet };
