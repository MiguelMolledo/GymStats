/**
 * Lógica pura del editor de plantillas: slugs, validación de config bilbo,
 * paleta de acentos. Sin dependencias de Supabase → testeable en aislamiento.
 */

/** Paleta de acentos para los bloques (picker simple). */
export const ACCENT_COLORS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#f97316", // orange
  "#22c55e", // green
  "#06b6d4", // cyan
  "#eab308", // yellow
  "#a855f7", // purple
  "#ef4444", // red
] as const;

export const DEFAULT_ACCENT = ACCENT_COLORS[0];

/**
 * Genera un slug a partir de un label: minúsculas, sin acentos, guiones,
 * solo [a-z0-9-]. Si queda vacío, usa un fallback.
 */
export function slugify(label: string, fallback = "bloque"): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || fallback;
}

/**
 * Devuelve un slug único dentro de `existing` añadiendo sufijos -2, -3...
 */
export function uniqueSlug(label: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const base = slugify(label);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export type BilboConfigInput = {
  target_reps: number;
  floor_reps: number;
};

export type ConfigValidation =
  | { ok: true; value: BilboConfigInput }
  | { ok: false; error: string };

/**
 * Valida la config bilbo: ambos enteros > 0 y floor < target.
 */
export function validateBilboConfig(
  targetRaw: unknown,
  floorRaw: unknown,
): ConfigValidation {
  const target = toInt(targetRaw);
  const floor = toInt(floorRaw);
  if (target === null || target <= 0) {
    return { ok: false, error: "Las reps objetivo deben ser un número mayor que 0." };
  }
  if (floor === null || floor <= 0) {
    return { ok: false, error: "Las reps mínimas deben ser un número mayor que 0." };
  }
  if (floor >= target) {
    return {
      ok: false,
      error: "Las reps mínimas deben ser menores que las reps objetivo.",
    };
  }
  return { ok: true, value: { target_reps: target, floor_reps: floor } };
}

function toInt(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}
