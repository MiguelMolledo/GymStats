import type { BilboConfig } from "./config";

/**
 * Fila de la serie 1 del ejercicio core de una sesión completada (ya filtrada
 * por is_core + set_number = 1). Datos mínimos y serializables → sirve tanto
 * en server como en client, y es puro/testeable.
 */
export type CoreSet1Row = {
  session_id: string;
  performed_on: string;
  /** desempate estable cuando dos sesiones comparten performed_on. */
  started_at?: string | null;
  weight: number | null;
  reps: number | null;
};

/** Subset relevante de un ciclo para acotar y describir sus puntos. */
export type CycleWindow = {
  started_at: string;
  ended_at: string | null;
  status: string;
};

/** Un punto de progreso: una sesión (serie 1 del core) dentro de un ciclo. */
export type CyclePoint = {
  index: number;
  /** "S1", "S2"… en orden cronológico dentro del ciclo. */
  label: string;
  /** fecha corta legible (dd/mm) para ejes y tarjetas. */
  dateLabel: string;
  performed_on: string;
  weight: number;
  reps: number;
};

function sortKey(row: CoreSet1Row): string {
  // performed_on es día (YYYY-MM-DD); started_at desempata dentro del día.
  return `${row.performed_on}T${row.started_at ?? "00:00:00.000Z"}`;
}

function toDateLabel(performedOn: string): string {
  // performed_on llega como YYYY-MM-DD (o ISO); tomamos la parte de fecha.
  const datePart = performedOn.slice(0, 10);
  const [, m, d] = datePart.split("-");
  if (!m || !d) return datePart;
  return `${d}/${m}`;
}

/**
 * Puntos de un ciclo: filas de serie 1 del core cuya sesión cae dentro de
 * [started_at, ended_at ?? ∞), ordenadas cronológicamente y etiquetadas S1..Sn.
 * Descarta filas sin weight o sin reps (no aportan un punto medible).
 * Función pura → testeable.
 */
export function cyclePoints(
  rows: CoreSet1Row[],
  cycle: CycleWindow,
): CyclePoint[] {
  // Acotamos por día (performed_on es YYYY-MM-DD): inclusivo en el inicio del
  // ciclo y, si está cerrado, inclusivo hasta el día de cierre.
  const startDay = cycle.started_at.slice(0, 10);
  const endDay = cycle.ended_at != null ? cycle.ended_at.slice(0, 10) : null;

  const inWindow = rows.filter((r) => {
    if (r.weight == null || r.reps == null) return false;
    if (r.performed_on.slice(0, 10) < startDay) return false;
    if (endDay != null && r.performed_on.slice(0, 10) > endDay) return false;
    return true;
  });

  inWindow.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));

  return inWindow.map((r, i) => ({
    index: i,
    label: `S${i + 1}`,
    dateLabel: toDateLabel(r.performed_on),
    performed_on: r.performed_on,
    weight: r.weight as number,
    reps: r.reps as number,
  }));
}

export type CycleStats = {
  start: CyclePoint | null;
  latest: CyclePoint | null;
  best: CyclePoint | null;
};

/**
 * Estadísticas de un ciclo a partir de sus puntos ordenados:
 *  - start  = primer punto
 *  - latest = último punto
 *  - best   = mayor weight; empate → más reps; si persiste, el primero.
 * Función pura → testeable.
 */
export function cycleStats(points: CyclePoint[]): CycleStats {
  if (points.length === 0) {
    return { start: null, latest: null, best: null };
  }
  let best = points[0];
  for (const p of points) {
    if (
      p.weight > best.weight ||
      (p.weight === best.weight && p.reps > best.reps)
    ) {
      best = p;
    }
  }
  return {
    start: points[0],
    latest: points[points.length - 1],
    best,
  };
}

/**
 * ¿Está el último punto en zona de cierre? (reps ≤ floor_reps).
 * `latest` null → false. Función pura → testeable.
 */
export function isInCloseZone(
  latest: CyclePoint | null,
  config: BilboConfig,
): boolean {
  if (!latest) return false;
  return latest.reps <= config.floor_reps;
}

export type ClosingData = {
  max_weight: number;
  closing_reps: number;
};

/**
 * Datos para cerrar un ciclo: max_weight = mayor peso alcanzado en el ciclo;
 * closing_reps = reps de la ÚLTIMA sesión (la que dispara el cierre).
 * Devuelve null si no hay puntos. Función pura → testeable.
 */
export function closingData(points: CyclePoint[]): ClosingData | null {
  if (points.length === 0) return null;
  const maxWeight = points.reduce((m, p) => (p.weight > m ? p.weight : m), points[0].weight);
  const closingReps = points[points.length - 1].reps;
  return { max_weight: maxWeight, closing_reps: closingReps };
}
