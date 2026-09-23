import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { getPlugin } from "@/plugins/registry";
import type { CompletedSet } from "@/plugins/types";

import type { LocalSession } from "./db";
import {
  isSetEmpty,
  parseReps,
  parseWeight,
  type LocalSet,
} from "./logic";

type Client = SupabaseClient<Database, "gymstats">;

/**
 * Ejecuta plugin.onSessionCompleted para una sesión completada.
 * Corre online: refetchea template/bloques/ejercicios de Supabase (config e
 * is_core actualizados); los sets salen de Dexie (estado final local).
 * Lanza si algo falla, para que el caller mantenga el hook como pendiente.
 */
export async function runCompletedSessionHook(
  supabase: Client,
  session: LocalSession,
  localSets: LocalSet[],
): Promise<void> {
  const { data: template, error: tErr } = await supabase
    .from("workout_templates")
    .select("id, plugin_key, config")
    .eq("id", session.template_id)
    .single();
  if (tErr) throw tErr;

  const plugin = getPlugin(template.plugin_key ?? session.plugin_key);
  if (!plugin?.onSessionCompleted) return;

  const { data: blocks, error: bErr } = await supabase
    .from("template_blocks")
    .select("*")
    .eq("template_id", template.id);
  if (bErr) throw bErr;

  const { data: exercises, error: eErr } = await supabase
    .from("template_exercises")
    .select("*")
    .in(
      "block_id",
      (blocks ?? []).map((b) => b.id),
    );
  if (eErr) throw eErr;

  const exerciseById = new Map((exercises ?? []).map((e) => [e.id, e]));
  const finalSets: CompletedSet[] = localSets
    .filter((s) => !isSetEmpty(s))
    .map((s) => ({
      exercise_id: s.exercise_id,
      set_number: s.set_number,
      weight: parseWeight(s.weight),
      reps: parseReps(s.reps),
      notes: s.notes.trim(),
      is_core: exerciseById.get(s.exercise_id)?.is_core ?? false,
    }));

  await plugin.onSessionCompleted({
    supabase,
    session: {
      id: session.id,
      user_id: session.user_id,
      template_id: session.template_id,
      block_id: session.block_id,
      performed_on: session.performed_on,
    },
    sets: finalSets,
    config: plugin.parseConfig(template.config),
    template,
    blocks: blocks ?? [],
    exercises: exercises ?? [],
  });
}
