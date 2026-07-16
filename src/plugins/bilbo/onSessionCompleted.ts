import type { SessionCompletedContext } from "../types";
import { coreSet1Weight, decideCycle, type ActiveCycle } from "./cycle-logic";

/**
 * Al completar una sesión BILBO: mira el peso de la serie 1 del core y
 * gestiona el ciclo del bloque (crear si no hay activo, o subir max_weight).
 * El cierre de ciclo (por reps ≤ floor) llega en Fase 3.
 */
export async function bilboOnSessionCompleted(
  ctx: SessionCompletedContext,
): Promise<void> {
  const { supabase, session, sets } = ctx;

  const coreWeight = coreSet1Weight(sets);
  if (coreWeight == null) return;

  // Ejercicio core del bloque (para exercise_id del ciclo).
  const coreExercise = ctx.exercises.find(
    (e) => e.block_id === session.block_id && e.is_core && !e.archived,
  );
  if (!coreExercise) return;

  // Ciclo activo del (usuario, bloque).
  const { data: existing, error: selErr } = await supabase
    .from("cycles")
    .select("id, max_weight")
    .eq("user_id", session.user_id)
    .eq("block_id", session.block_id)
    .eq("status", "active")
    .maybeSingle();
  if (selErr) throw selErr;

  const decision = decideCycle(coreWeight, existing as ActiveCycle | null);

  if (decision.kind === "create") {
    const { error } = await supabase.from("cycles").insert({
      user_id: session.user_id,
      template_id: session.template_id,
      block_id: session.block_id,
      exercise_id: coreExercise.id,
      status: "active",
      started_at: new Date().toISOString(),
      start_weight: decision.startWeight,
      max_weight: decision.startWeight,
    });
    if (error) throw error;
  } else if (decision.kind === "update-max") {
    const { error } = await supabase
      .from("cycles")
      .update({ max_weight: decision.maxWeight })
      .eq("id", decision.cycleId);
    if (error) throw error;
  }
}
