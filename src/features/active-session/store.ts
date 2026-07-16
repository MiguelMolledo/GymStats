"use client";

import { create } from "zustand";

import { createClient } from "@/lib/supabase/client";

import { getDB, type LocalSession, type LocalSet } from "./db";
import { prefillWeight, type PreviousSet } from "./logic";
import { getSyncEngine } from "./sync";

/** Ejercicio de un bloque, para inicializar los sets locales. */
export type BlockExercise = {
  id: string;
  name: string;
  target_sets: number;
  is_core: boolean;
  position: number;
};

/** Datos necesarios para arrancar una sesión de un bloque. */
export type StartSessionInput = {
  userId: string;
  templateId: string;
  blockId: string;
  performedOn: string; // YYYY-MM-DD
  exercises: BlockExercise[];
  /** Sets de la última sesión completada del mismo bloque (prefill). */
  previousSets: PreviousSet[];
};

type StoreState = {
  hydrated: boolean;
  session: LocalSession | null;
  sets: LocalSet[];
  hydrate: () => Promise<void>;
  startSession: (input: StartSessionInput) => Promise<void>;
  updateSetField: (
    setId: string,
    field: "weight" | "reps" | "notes",
    value: string,
  ) => Promise<void>;
  updateSessionField: (
    field: "notes" | "performed_on",
    value: string,
  ) => Promise<void>;
  completeSession: () => Promise<void>;
  discardSession: () => Promise<void>;
  clearLocal: () => Promise<void>;
};

function nowISO() {
  return new Date().toISOString();
}

export const useSessionStore = create<StoreState>((set, get) => ({
  hydrated: false,
  session: null,
  sets: [],

  async hydrate() {
    const db = getDB();
    const session = await db.localSessions
      .where("status")
      .equals("active")
      .first();
    if (!session) {
      set({ hydrated: true, session: null, sets: [] });
      return;
    }
    const sets = await db.localSets
      .where("session_id")
      .equals(session.id)
      .toArray();
    sets.sort((a, b) =>
      a.exercise_id === b.exercise_id
        ? a.set_number - b.set_number
        : a.exercise_id.localeCompare(b.exercise_id),
    );
    // Arranca el motor de sync y reintenta lo pendiente.
    const engine = getSyncEngine();
    engine.init(createClient());
    engine.schedule();
    set({ hydrated: true, session, sets });
  },

  async startSession(input) {
    const db = getDB();
    // Solo una sesión activa local: descarta cualquier resto previo.
    await db.localSessions.where("status").equals("active").delete();
    // (Los sets huérfanos se limpian aparte para no dejar basura.)
    const stale = await db.localSessions.toArray();
    const staleIds = new Set(stale.map((s) => s.id));
    const allSets = await db.localSets.toArray();
    const orphan = allSets
      .filter((s) => !staleIds.has(s.session_id))
      .map((s) => s.id);
    if (orphan.length) await db.localSets.bulkDelete(orphan);

    const sessionId = crypto.randomUUID();
    const startedAt = nowISO();
    const session: LocalSession = {
      id: sessionId,
      user_id: input.userId,
      template_id: input.templateId,
      block_id: input.blockId,
      performed_on: input.performedOn,
      notes: "",
      started_at: startedAt,
      status: "active",
      dirty: 1,
      syncedInsert: 0,
      pendingCompletedHook: 0,
    };

    const sets: LocalSet[] = [];
    const ordered = [...input.exercises].sort(
      (a, b) => a.position - b.position,
    );
    for (const ex of ordered) {
      const count = Math.max(1, ex.target_sets);
      for (let n = 1; n <= count; n++) {
        // Prefill de peso desde la última sesión (no marca dirty).
        const weight = prefillWeight(input.previousSets, ex.id, n);
        sets.push({
          id: crypto.randomUUID(),
          session_id: sessionId,
          exercise_id: ex.id,
          exercise_name: ex.name,
          set_number: n,
          weight,
          reps: "",
          notes: "",
          dirty: 0,
          updated_at: startedAt,
        });
      }
    }

    await db.transaction("rw", db.localSessions, db.localSets, async () => {
      await db.localSessions.put(session);
      await db.localSets.bulkPut(sets);
    });

    const engine = getSyncEngine();
    engine.init(createClient());
    set({ hydrated: true, session, sets });
    // Inserta la sesión en remoto en cuanto haya red (debounce corto no,
    // queremos que exista pronto: schedule normal, se inserta al primer ciclo).
    engine.schedule();
  },

  async updateSetField(setId, field, value) {
    const db = getDB();
    const updated = nowISO();
    await db.localSets.update(setId, { [field]: value, dirty: 1, updated_at: updated });
    set((state) => ({
      sets: state.sets.map((s) =>
        s.id === setId
          ? { ...s, [field]: value, dirty: 1, updated_at: updated }
          : s,
      ),
    }));
    getSyncEngine().schedule();
  },

  async updateSessionField(field, value) {
    const { session } = get();
    if (!session) return;
    const db = getDB();
    await db.localSessions.update(session.id, { [field]: value, dirty: 1 });
    set({ session: { ...session, [field]: value, dirty: 1 } });
    getSyncEngine().schedule();
  },

  async completeSession() {
    const { session } = get();
    if (!session) return;
    const db = getDB();
    // Marca completed localmente y dirty para que el push la propague.
    await db.localSessions.update(session.id, {
      status: "completed",
      dirty: 1,
    });
    set({ session: { ...session, status: "completed", dirty: 1 } });
  },

  async discardSession() {
    const { session } = get();
    if (!session) return;
    const db = getDB();
    const engine = getSyncEngine();
    // Si existe en remoto, márcala discarded allí (best-effort).
    if (session.syncedInsert === 1) {
      try {
        const supabase = createClient();
        await supabase
          .from("workout_sessions")
          .update({ status: "discarded" })
          .eq("id", session.id);
      } catch {
        // best-effort: si falla, la sesión remota queda active pero el banner
        // de Inicio permite volver a descartarla.
      }
    }
    await db.transaction("rw", db.localSessions, db.localSets, async () => {
      await db.localSets.where("session_id").equals(session.id).delete();
      await db.localSessions.delete(session.id);
    });
    engine.reset();
    set({ session: null, sets: [] });
  },

  async clearLocal() {
    const { session } = get();
    const db = getDB();
    if (session) {
      await db.transaction("rw", db.localSessions, db.localSets, async () => {
        await db.localSets.where("session_id").equals(session.id).delete();
        await db.localSessions.delete(session.id);
      });
    }
    getSyncEngine().reset();
    set({ session: null, sets: [] });
  },
}));
