export type BilboConfig = {
  target_reps: number;
  floor_reps: number;
};

export const BILBO_DEFAULTS: BilboConfig = {
  target_reps: 32,
  floor_reps: 12,
};

/**
 * Parsea la config `{target_reps, floor_reps}` de un template BILBO.
 * Tolerante: aplica defaults 32/12 ante valores ausentes o no numéricos.
 * Función pura → testeable.
 */
export function parseBilboConfig(raw: unknown): BilboConfig {
  if (typeof raw !== "object" || raw === null) {
    return { ...BILBO_DEFAULTS };
  }
  const obj = raw as Record<string, unknown>;
  const target = toPositiveInt(obj.target_reps, BILBO_DEFAULTS.target_reps);
  const floor = toPositiveInt(obj.floor_reps, BILBO_DEFAULTS.floor_reps);
  return { target_reps: target, floor_reps: floor };
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}
