"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type {
  EntrenarBlock,
  EntrenarExercise,
} from "@/app/(app)/entrenar/EntrenarClient";

import { getDB, type LocalSession, type LocalSet } from "./db";

type Client = SupabaseClient<Database, "gymstats">;

/** Datos necesarios para rehidratar una sesión que solo existe en remoto. */
export type RehydrateInput = {
  supabase: Client;
  userId: string;
  template: { id: string; plugin_key: string };
  blocks: EntrenarBlock[];
  exercises: EntrenarExercise[];
};

function nowISO() {
  return new Date().toISOString();
}

/** numeric/int remoto (posible null) al string de input de LocalSet. */
function remoteToInput(value: number | null): string {
  return value == null ? "" : String(value);
}

/**
 * Reconstruye en Dexie una sesión activa que quedó SOLO en Supabase (el usuario
 * perdió el IndexedDB): así "Continuar" reabre el formulario en vez de aterrizar
 * en el selector de bloques. Client-side (usa crypto/Dexie).
 *
 * Devuelve `true` si escribió la sesión en local (el caller debe re-hidratar el
 * store); `false` en cualquier otro caso (sin remota, no coincide, carrera, etc.).
 * No lanza por diseño: cualquier fallo/offline se traduce en `false`.
 */
export async function rehydrateRemoteSession(
  input: RehydrateInput,
): Promise<boolean> {
  const { supabase, userId, template, blocks, exercises } = input;
  const db = getDB();

  // 1) Si ya hay CUALQUIER sesión local, no rehidratamos (la local manda).
  if ((await db.localSessions.count()) > 0) return false;

  // 2) Sesión remota activa. RLS filtra por usuario; el índice único parcial
  //    garantiza como mucho una, así que maybeSingle es seguro.
  const { data: remote, error } = await supabase
    .from("workout_sessions")
    .select("id, user_id, template_id, block_id, performed_on, notes, started_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !remote) return false;

  // 3) Solo rehidratamos si coincide con el template y un bloque actuales; si no,
  //    dejamos el banner para descartar (no sabríamos reconstruir la rejilla).
  if (remote.template_id !== template.id) return false;
  if (!blocks.some((b) => b.id === remote.block_id)) return false;

  // 4) Sets remotos de esa sesión.
  const { data: remoteSets, error: setsErr } = await supabase
    .from("session_sets")
    .select("id, exercise_id, set_number, weight, reps, notes, updated_at")
    .eq("session_id", remote.id);
  if (setsErr) return false;

  const startedAt = remote.started_at ?? nowISO();

  // Ejercicios del bloque, ordenados por posición (misma rejilla que startSession).
  const blockExercises = exercises
    .filter((e) => e.block_id === remote.block_id)
    .sort((a, b) => a.position - b.position);
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));

  // Índice de valores remotos por (exercise_id, set_number) para fusionarlos.
  const remoteByKey = new Map<string, (typeof remoteSets)[number]>();
  for (const rs of remoteSets ?? []) {
    remoteByKey.set(`${rs.exercise_id}:${rs.set_number}`, rs);
  }
  const usedRemoteIds = new Set<string>();

  const localSets: LocalSet[] = [];
  for (const ex of blockExercises) {
    const count = Math.max(1, ex.target_sets);
    for (let n = 1; n <= count; n++) {
      const rs = remoteByKey.get(`${ex.id}:${n}`);
      if (rs) {
        // Set con valor remoto: conserva su id remoto (para que futuros upserts
        // actualicen en vez de duplicar) y queda limpio (dirty:0).
        usedRemoteIds.add(rs.id);
        localSets.push({
          id: rs.id,
          session_id: remote.id,
          exercise_id: ex.id,
          exercise_name: ex.name,
          set_number: n,
          weight: remoteToInput(rs.weight),
          reps: remoteToInput(rs.reps),
          notes: rs.notes ?? "",
          dirty: 0,
          updated_at: rs.updated_at ?? startedAt,
        });
      } else {
        // Celda vacía de la rejilla: id local nuevo.
        localSets.push({
          id: crypto.randomUUID(),
          session_id: remote.id,
          exercise_id: ex.id,
          exercise_name: ex.name,
          set_number: n,
          weight: "",
          reps: "",
          notes: "",
          dirty: 0,
          updated_at: startedAt,
        });
      }
    }
  }

  // Sets remotos fuera de la rejilla actual (set_number extra o ejercicio que ya
  // no existe): se conservan tal cual para no perder datos.
  for (const rs of remoteSets ?? []) {
    if (usedRemoteIds.has(rs.id)) continue;
    localSets.push({
      id: rs.id,
      session_id: remote.id,
      exercise_id: rs.exercise_id,
      exercise_name: nameById.get(rs.exercise_id) ?? "",
      set_number: rs.set_number,
      weight: remoteToInput(rs.weight),
      reps: remoteToInput(rs.reps),
      notes: rs.notes ?? "",
      dirty: 0,
      updated_at: rs.updated_at ?? startedAt,
    });
  }

  const localSession: LocalSession = {
    id: remote.id,
    user_id: remote.user_id,
    template_id: remote.template_id,
    block_id: remote.block_id,
    // Plugin del template actual (el remoto no lo guarda).
    plugin_key: template.plugin_key,
    performed_on: remote.performed_on,
    notes: remote.notes ?? "",
    started_at: startedAt,
    completed_at: null,
    status: "active",
    // Ya existe en remoto y sin cambios pendientes.
    dirty: 0,
    syncedInsert: 1,
    pendingCompletedHook: 0,
  };

  // Escritura atómica con re-comprobación dentro de la transacción para evitar
  // pisar una sesión que el usuario haya arrancado mientras consultábamos remoto.
  let wrote = false;
  await db.transaction("rw", db.localSessions, db.localSets, async () => {
    if ((await db.localSessions.count()) > 0) return;
    await db.localSessions.put(localSession);
    await db.localSets.bulkPut(localSets);
    wrote = true;
  });

  return wrote;
}
