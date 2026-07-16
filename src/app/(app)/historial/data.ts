import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** Bloque de una sesión, tal como se muestra en el historial. */
export type HistorialBlock = {
  id: string;
  label: string;
  emoji: string | null;
  accent_color: string | null;
};

/** Un set de una sesión (ya resuelto con su ejercicio). */
export type HistorialSet = {
  set_number: number;
  weight: number | null;
  reps: number | null;
  notes: string;
};

/** Un ejercicio dentro de una sesión con sus sets, en orden de position. */
export type HistorialExercise = {
  id: string;
  name: string;
  is_core: boolean;
  position: number;
  sets: HistorialSet[];
};

/** Una sesión completada con su bloque y detalle de ejercicios. */
export type HistorialSession = {
  id: string;
  performed_on: string;
  notes: string;
  block: HistorialBlock;
  exercises: HistorialExercise[];
};

/** Contador por bloque presente en el mes. */
export type BlockCount = {
  id: string;
  label: string;
  emoji: string | null;
  accent_color: string | null;
  count: number;
};

/** Resumen del mes: total de sesiones + desglose por bloque. */
export type MonthSummary = {
  total: number;
  blocks: BlockCount[];
};

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const MESES_ABBR = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

/** Nombre completo del mes 1..12 en español. */
export function monthName(month: number): string {
  return MESES[month - 1] ?? "";
}

/** Nombres de los 12 meses para selectores. */
export function monthNames(): readonly string[] {
  return MESES;
}

/**
 * Fecha larga es-ES a partir de un YYYY-MM-DD (o ISO): "30 jun 2026".
 * No usa Date para evitar desfases de zona horaria en el día.
 */
export function formatSessionDate(performedOn: string): string {
  const [y, m, d] = performedOn.slice(0, 10).split("-");
  const day = Number(d);
  const month = MESES_ABBR[Number(m) - 1];
  if (!day || !month || !y) return performedOn;
  return `${day} ${month} ${y}`;
}

/** Peso formateado: "82.5 kg", entero sin decimales, null → "—". */
export function formatWeight(w: number | null): string {
  if (w == null) return "—";
  return `${w} kg`;
}

/** Rango [inicio, finExclusivo) del mes en formato YYYY-MM-DD. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { from, to };
}

/**
 * Resumen del mes a partir de las sesiones: total + un contador por bloque
 * presente (en orden de aparición). Función pura → testeable.
 */
export function summarize(sessions: HistorialSession[]): MonthSummary {
  const byBlock = new Map<string, BlockCount>();
  for (const s of sessions) {
    const existing = byBlock.get(s.block.id);
    if (existing) {
      existing.count += 1;
    } else {
      byBlock.set(s.block.id, {
        id: s.block.id,
        label: s.block.label,
        emoji: s.block.emoji,
        accent_color: s.block.accent_color,
        count: 1,
      });
    }
  }
  return { total: sessions.length, blocks: [...byBlock.values()] };
}

type SessionRow = {
  id: string;
  performed_on: string;
  notes: string;
  block_id: string;
  started_at: string | null;
};

type SetRow = {
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  notes: string;
};

type ExerciseMeta = {
  id: string;
  name: string;
  is_core: boolean;
  position: number;
};

/**
 * Agrupa los sets de una sesión por ejercicio, en el ORDEN de position de
 * template_exercises. Ignora sets de ejercicios desconocidos. Dentro de cada
 * ejercicio, los sets van ordenados por set_number. Función pura → testeable.
 */
export function groupSets(
  sets: SetRow[],
  exercisesById: Map<string, ExerciseMeta>,
): HistorialExercise[] {
  const byExercise = new Map<string, HistorialSet[]>();
  for (const set of sets) {
    if (!exercisesById.has(set.exercise_id)) continue;
    let list = byExercise.get(set.exercise_id);
    if (!list) {
      list = [];
      byExercise.set(set.exercise_id, list);
    }
    list.push({
      set_number: set.set_number,
      weight: set.weight,
      reps: set.reps,
      notes: set.notes,
    });
  }

  const result: HistorialExercise[] = [];
  for (const [exerciseId, exSets] of byExercise) {
    const meta = exercisesById.get(exerciseId)!;
    exSets.sort((a, b) => a.set_number - b.set_number);
    result.push({ ...meta, sets: exSets });
  }
  result.sort((a, b) => a.position - b.position);
  return result;
}

/**
 * Carga las sesiones `completed` del usuario en el mes [year, month],
 * ordenadas por performed_on desc (started_at desempata), con su bloque y el
 * detalle de sets agrupados por ejercicio en orden de position.
 *
 * Los joins van por block_id/exercise_id de la propia sesión (no por la
 * plantilla activa) → funciona con sesiones de cualquier plantilla.
 */
export async function loadMonthSessions(
  supabase: Client,
  userId: string,
  year: number,
  month: number,
): Promise<HistorialSession[]> {
  const { from, to } = monthRange(year, month);

  const { data: sessionRows } = await supabase
    .from("workout_sessions")
    .select("id, performed_on, notes, block_id, started_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("performed_on", from)
    .lt("performed_on", to)
    .order("performed_on", { ascending: false })
    .order("started_at", { ascending: false });

  const sessions = (sessionRows ?? []) as SessionRow[];
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const blockIds = [...new Set(sessions.map((s) => s.block_id))];

  const [{ data: blockRows }, { data: setRows }] = await Promise.all([
    supabase
      .from("template_blocks")
      .select("id, label, emoji, accent_color")
      .in("id", blockIds),
    supabase
      .from("session_sets")
      .select("session_id, exercise_id, set_number, weight, reps, notes")
      .in("session_id", sessionIds),
  ]);

  const blockById = new Map<string, HistorialBlock>();
  for (const b of blockRows ?? []) {
    blockById.set(b.id, {
      id: b.id,
      label: b.label,
      emoji: b.emoji,
      accent_color: b.accent_color,
    });
  }

  const sets = (setRows ?? []) as SetRow[];
  const exerciseIds = [...new Set(sets.map((s) => s.exercise_id))];
  const exercisesById = new Map<string, ExerciseMeta>();
  if (exerciseIds.length > 0) {
    const { data: exRows } = await supabase
      .from("template_exercises")
      .select("id, name, is_core, position")
      .in("id", exerciseIds);
    for (const e of exRows ?? []) {
      exercisesById.set(e.id, {
        id: e.id,
        name: e.name,
        is_core: e.is_core,
        position: e.position,
      });
    }
  }

  const setsBySession = new Map<string, SetRow[]>();
  for (const set of sets) {
    let list = setsBySession.get(set.session_id);
    if (!list) {
      list = [];
      setsBySession.set(set.session_id, list);
    }
    list.push(set);
  }

  const fallbackBlock = (id: string): HistorialBlock => ({
    id,
    label: "Bloque",
    emoji: null,
    accent_color: null,
  });

  return sessions.map((s) => ({
    id: s.id,
    performed_on: s.performed_on,
    notes: s.notes,
    block: blockById.get(s.block_id) ?? fallbackBlock(s.block_id),
    exercises: groupSets(setsBySession.get(s.id) ?? [], exercisesById),
  }));
}

/**
 * Año de la primera sesión del usuario (min performed_on). Si no tiene
 * sesiones, devuelve el año pasado como fallback.
 */
export async function firstSessionYear(
  supabase: Client,
  userId: string,
  currentYear: number,
): Promise<number> {
  const { data } = await supabase
    .from("workout_sessions")
    .select("performed_on")
    .eq("user_id", userId)
    .order("performed_on", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data?.performed_on) return currentYear;
  const year = Number(data.performed_on.slice(0, 4));
  return Number.isFinite(year) ? year : currentYear;
}
