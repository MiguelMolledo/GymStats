"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import { cyclePoints, closingData, type CoreSet1Row } from "./progression";

export type CloseCycleResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Cierra un ciclo activo del usuario: status='closed', ended_at=now, y
 * max_weight/closing_reps calculados con `closingData` sobre los puntos del
 * ciclo (serie 1 del core). RLS garantiza que solo se toca un ciclo propio.
 */
export async function closeCycle(cycleId: string): Promise<CloseCycleResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  // Ciclo (propio y activo) con su ventana temporal y ejercicio core.
  const { data: cycle, error: cycleErr } = await supabase
    .from("cycles")
    .select("id, user_id, block_id, exercise_id, status, started_at, ended_at")
    .eq("id", cycleId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (cycleErr) return { ok: false, error: cycleErr.message };
  if (!cycle) return { ok: false, error: "Ciclo no encontrado" };
  if (cycle.status !== "active") return { ok: false, error: "El ciclo ya está cerrado" };

  // Filas de serie 1 del core (sesiones completadas del usuario en ese bloque).
  const { data: sessions, error: sessErr } = await supabase
    .from("workout_sessions")
    .select("id, performed_on, started_at")
    .eq("user_id", user.id)
    .eq("block_id", cycle.block_id)
    .eq("status", "completed");
  if (sessErr) return { ok: false, error: sessErr.message };

  const sessionIds = (sessions ?? []).map((s) => s.id);
  let rows: CoreSet1Row[] = [];
  if (sessionIds.length > 0) {
    const { data: sets, error: setsErr } = await supabase
      .from("session_sets")
      .select("session_id, weight, reps")
      .eq("exercise_id", cycle.exercise_id)
      .eq("set_number", 1)
      .in("session_id", sessionIds);
    if (setsErr) return { ok: false, error: setsErr.message };

    const byId = new Map(
      (sessions ?? []).map((s) => [s.id, s]),
    );
    rows = (sets ?? []).flatMap((set) => {
      const s = byId.get(set.session_id);
      if (!s) return [];
      return [
        {
          session_id: set.session_id,
          performed_on: s.performed_on,
          started_at: s.started_at,
          weight: set.weight,
          reps: set.reps,
        },
      ];
    });
  }

  const points = cyclePoints(rows, {
    started_at: cycle.started_at,
    ended_at: cycle.ended_at,
    status: cycle.status,
  });
  const closing = closingData(points);

  const { error: updErr } = await supabase
    .from("cycles")
    .update({
      status: "closed",
      ended_at: new Date().toISOString(),
      max_weight: closing?.max_weight ?? null,
      closing_reps: closing?.closing_reps ?? null,
    })
    .eq("id", cycle.id)
    .eq("user_id", user.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/");
  revalidatePath("/v/ciclos");
  return { ok: true };
}
