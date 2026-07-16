/**
 * Lógica pura del motor local-first. Sin dependencias de Dexie/Supabase/React
 * para poder testearla de forma aislada.
 */

/** Set tal como se guarda localmente: inputs como strings. */
export type LocalSet = {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  set_number: number;
  weight: string;
  reps: string;
  notes: string;
  dirty: 0 | 1;
  updated_at: string;
};

/** Payload de un set listo para upsert a Supabase (tipos convertidos). */
export type RemoteSet = {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  notes: string;
};

/**
 * Convierte el string de peso a numeric (o null si vacío/no válido).
 * Acepta coma o punto decimal. Función pura.
 */
export function parseWeight(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  // Redondeo a 2 decimales (columna numeric(6,2)).
  return Math.round(n * 100) / 100;
}

/**
 * Convierte el string de reps a entero (o null si vacío/no válido).
 * Función pura.
 */
export function parseReps(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/**
 * Un set está "vacío" si no tiene peso, ni reps, ni nota.
 * Los vacíos NO se envían a Supabase. Función pura.
 */
export function isSetEmpty(set: {
  weight: string;
  reps: string;
  notes: string;
}): boolean {
  return (
    set.weight.trim() === "" &&
    set.reps.trim() === "" &&
    set.notes.trim() === ""
  );
}

/**
 * A partir de los sets locales marcados dirty, selecciona los que deben
 * sincronizarse (los vacíos quedan fuera) y los convierte a payload remoto.
 * Función pura.
 */
export function selectSetsToSync(sets: LocalSet[]): RemoteSet[] {
  return sets
    .filter((s) => s.dirty === 1 && !isSetEmpty(s))
    .map((s) => ({
      id: s.id,
      session_id: s.session_id,
      exercise_id: s.exercise_id,
      set_number: s.set_number,
      weight: parseWeight(s.weight),
      reps: parseReps(s.reps),
      notes: s.notes.trim(),
    }));
}

// ---------------------------------------------------------------------------
// Prefill
// ---------------------------------------------------------------------------

/** Un set de la última sesión completada del mismo bloque. */
export type PreviousSet = {
  exercise_id: string;
  set_number: number;
  weight: number | null;
};

/**
 * Peso a precargar para (exercise_id, set_number):
 *  - match exacto exercise_id + set_number
 *  - fallback: el set 1 del mismo ejercicio
 *  - si nada, null
 * Devuelve el peso como string de input ("" si null). Función pura.
 */
export function prefillWeight(
  previousSets: PreviousSet[],
  exerciseId: string,
  setNumber: number,
): string {
  const exact = previousSets.find(
    (s) => s.exercise_id === exerciseId && s.set_number === setNumber,
  );
  if (exact && exact.weight != null) {
    return weightToInput(exact.weight);
  }
  const set1 = previousSets.find(
    (s) => s.exercise_id === exerciseId && s.set_number === 1,
  );
  if (set1 && set1.weight != null) {
    return weightToInput(set1.weight);
  }
  return "";
}

/** Formatea un peso numérico como string de input (sin ceros colgantes). */
export function weightToInput(weight: number): string {
  return String(weight);
}
