import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { parseBilboConfig, type BilboConfig } from "./config";
import type { CoreSet1Row } from "./progression";

type Client = SupabaseClient<Database, "gymstats">;

/** Bloque (con su ejercicio core) tal como lo consume el Dashboard/Ciclos. */
export type BilboBlock = {
  id: string;
  slug: string;
  label: string;
  emoji: string | null;
  accent_color: string | null;
  position: number;
  core: { id: string; name: string } | null;
};

/** Ciclo serializable (subset relevante). */
export type BilboCycle = {
  id: string;
  block_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  start_weight: number | null;
  max_weight: number | null;
  closing_reps: number | null;
};

/** Datos del Dashboard de Inicio: por bloque, su ciclo relevante y sus filas. */
export type BilboBlockData = {
  block: BilboBlock;
  /** ciclo activo, o el último cerrado si no hay activo, o null. */
  cycle: BilboCycle | null;
  /** filas de serie 1 del core (todas las sesiones completadas del bloque). */
  rows: CoreSet1Row[];
};

export type BilboDashboardData = {
  config: BilboConfig;
  blocks: BilboBlockData[];
};

/** Datos de la vista Ciclos: bloques, TODOS los ciclos y filas por bloque. */
export type BilboCyclesData = {
  config: BilboConfig;
  blocks: BilboBlock[];
  cycles: BilboCycle[];
  /** filas de serie 1 del core indexadas por block_id. */
  rowsByBlock: Record<string, CoreSet1Row[]>;
};

/**
 * Carga bloques (con ejercicio core), config y filas de serie 1 del core por
 * bloque para el usuario y plantilla dados. Base común de ambas vistas.
 */
async function loadBase(
  supabase: Client,
  userId: string,
  templateId: string,
): Promise<{
  config: BilboConfig;
  blocks: BilboBlock[];
  rowsByBlock: Record<string, CoreSet1Row[]>;
} | null> {
  const [{ data: template }, { data: blockRows }, { data: exerciseRows }] =
    await Promise.all([
      supabase
        .from("workout_templates")
        .select("id, config")
        .eq("id", templateId)
        .single(),
      supabase
        .from("template_blocks")
        .select("id, slug, label, emoji, accent_color, position")
        .eq("template_id", templateId)
        .order("position"),
      supabase
        .from("template_exercises")
        .select("id, block_id, name, is_core, archived"),
    ]);

  if (!template || !blockRows) return null;

  const config = parseBilboConfig(template.config);

  const coreByBlock = new Map<string, { id: string; name: string }>();
  for (const ex of exerciseRows ?? []) {
    if (ex.is_core && !ex.archived && !coreByBlock.has(ex.block_id)) {
      coreByBlock.set(ex.block_id, { id: ex.id, name: ex.name });
    }
  }

  const blocks: BilboBlock[] = blockRows.map((b) => ({
    id: b.id,
    slug: b.slug,
    label: b.label,
    emoji: b.emoji,
    accent_color: b.accent_color,
    position: b.position,
    core: coreByBlock.get(b.id) ?? null,
  }));

  // Sesiones completadas del usuario en estos bloques.
  const blockIds = blocks.map((b) => b.id);
  const { data: sessions } = await supabase
    .from("workout_sessions")
    .select("id, block_id, performed_on, started_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .in("block_id", blockIds);

  const rowsByBlock: Record<string, CoreSet1Row[]> = {};
  const sessionMeta = new Map<
    string,
    { block_id: string; performed_on: string; started_at: string | null }
  >();
  for (const s of sessions ?? []) {
    sessionMeta.set(s.id, {
      block_id: s.block_id,
      performed_on: s.performed_on,
      started_at: s.started_at,
    });
  }

  const coreExerciseIds = [...coreByBlock.values()].map((c) => c.id);
  const sessionIds = [...sessionMeta.keys()];
  if (coreExerciseIds.length > 0 && sessionIds.length > 0) {
    const { data: sets } = await supabase
      .from("session_sets")
      .select("session_id, exercise_id, weight, reps")
      .eq("set_number", 1)
      .in("exercise_id", coreExerciseIds)
      .in("session_id", sessionIds);

    for (const set of sets ?? []) {
      const meta = sessionMeta.get(set.session_id);
      if (!meta) continue;
      (rowsByBlock[meta.block_id] ??= []).push({
        session_id: set.session_id,
        performed_on: meta.performed_on,
        started_at: meta.started_at,
        weight: set.weight,
        reps: set.reps,
      });
    }
  }

  return { config, blocks, rowsByBlock };
}

function mapCycle(
  c: Database["gymstats"]["Tables"]["cycles"]["Row"],
): BilboCycle {
  return {
    id: c.id,
    block_id: c.block_id,
    status: c.status,
    started_at: c.started_at,
    ended_at: c.ended_at,
    start_weight: c.start_weight,
    max_weight: c.max_weight,
    closing_reps: c.closing_reps,
  };
}

/** Datos del Dashboard de Inicio. Devuelve null si la plantilla no carga. */
export async function loadBilboDashboardData(
  supabase: Client,
  userId: string,
  templateId: string,
): Promise<BilboDashboardData | null> {
  const base = await loadBase(supabase, userId, templateId);
  if (!base) return null;

  const { data: cycleRows } = await supabase
    .from("cycles")
    .select("*")
    .eq("user_id", userId)
    .eq("template_id", templateId)
    .order("started_at", { ascending: false });

  // Por bloque: ciclo activo, o el último cerrado (más reciente por started_at).
  const activeByBlock = new Map<string, BilboCycle>();
  const lastByBlock = new Map<string, BilboCycle>();
  for (const raw of cycleRows ?? []) {
    const c = mapCycle(raw);
    if (c.status === "active" && !activeByBlock.has(c.block_id)) {
      activeByBlock.set(c.block_id, c);
    }
    if (!lastByBlock.has(c.block_id)) lastByBlock.set(c.block_id, c);
  }

  const blocks: BilboBlockData[] = base.blocks.map((block) => ({
    block,
    cycle: activeByBlock.get(block.id) ?? lastByBlock.get(block.id) ?? null,
    rows: base.rowsByBlock[block.id] ?? [],
  }));

  return { config: base.config, blocks };
}

/** Datos de la vista Ciclos. Devuelve null si la plantilla no carga. */
export async function loadBilboCyclesData(
  supabase: Client,
  userId: string,
  templateId: string,
): Promise<BilboCyclesData | null> {
  const base = await loadBase(supabase, userId, templateId);
  if (!base) return null;

  const { data: cycleRows } = await supabase
    .from("cycles")
    .select("*")
    .eq("user_id", userId)
    .eq("template_id", templateId)
    .order("started_at", { ascending: false });

  return {
    config: base.config,
    blocks: base.blocks,
    cycles: (cycleRows ?? []).map(mapCycle),
    rowsByBlock: base.rowsByBlock,
  };
}
