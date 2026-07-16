"use client";

import { create } from "zustand";

import { createClient } from "@/lib/supabase/client";

import { getDB, type LocalSession, type LocalSet } from "./db";
import { discardLocalSession } from "./discard";
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
  pluginKey: string;
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
  /** Limpia SOLO el estado en memoria. Los datos locales quedan en Dexie. */
  resetMemory: () => void;
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
    const all = await db.localSessions.toArray();

    // Si hay CUALQUIER trabajo local pendiente (activa, completed-pendiente,
    // discarded-pendiente), arranca el motor para que lo vuelque.
    if (all.length > 0) {
      const engine = getSyncEngine();
      engine.init(createClient());
      engine.schedule();
    }

    // Solo la sesión ACTIVE abre el formulario. Una completed-pendiente NO es
    // "entrenamiento en curso": solo está esperando sincronizarse.
    const session = all.find((s) => s.status === "active") ?? null;
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
    set({ hydrated: true, session, sets });
  },

  async startSession(input) {
    const db = getDB();
    // Solo una sesión activa local: elimina restos 'active' (nunca las
    // completed/discarded pendientes de sync, que aún tienen trabajo).
    const staleActive = await db.localSessions
      .where("status")
      .equals("active")
      .toArray();
    if (staleActive.length > 0) {
      await db.transaction("rw", db.localSessions, db.localSets, async () => {
        for (const s of staleActive) {
          await db.localSets.where("session_id").equals(s.id).delete();
          await db.localSessions.delete(s.id);
        }
      });
    }

    const sessionId = crypto.randomUUID();
    const startedAt = nowISO();
    const session: LocalSession = {
      id: sessionId,
      user_id: input.userId,
      template_id: input.templateId,
      block_id: input.blockId,
      plugin_key: input.pluginKey,
      performed_on: input.performedOn,
      notes: "",
      started_at: startedAt,
      completed_at: null,
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
    // Inserta la sesión en remoto en cuanto haya red.
    engine.schedule();
  },

  async updateSetField(setId, field, value) {
    const db = getDB();
    const updated = nowISO();
    await db.localSets.update(setId, {
      [field]: value,
      dirty: 1,
      updated_at: updated,
    });
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
    // Marca completed + hook pendiente. El motor de sync empuja el estado y,
    // cuando todo está limpio, ejecuta el hook del plugin y borra el local.
    const patch = {
      status: "completed",
      dirty: 1,
      completed_at: nowISO(),
      pendingCompletedHook: 1,
    } as const;
    await db.localSessions.update(session.id, patch);
    set({ session: { ...session, ...patch } });
  },

  async discardSession() {
    const { session } = get();
    if (!session) return;
    await discardLocalSession(session.id);
    set({ session: null, sets: [] });
  },

  resetMemory() {
    set({ session: null, sets: [] });
  },
}));
