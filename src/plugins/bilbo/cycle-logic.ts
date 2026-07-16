import type { CompletedSet } from "../types";

/** Ciclo activo (subset relevante) tal como llega de la DB. */
export type ActiveCycle = {
  id: string;
  max_weight: number | null;
};

export type CycleDecision =
  | { kind: "none" }
  | { kind: "create"; startWeight: number }
  | { kind: "update-max"; cycleId: string; maxWeight: number }
  | { kind: "noop" };

/**
 * Peso de la serie 1 del ejercicio core a partir de los sets finales.
 * Devuelve null si no hay serie 1 del core con peso registrado.
 * Función pura → testeable.
 */
export function coreSet1Weight(sets: CompletedSet[]): number | null {
  const set1 = sets.find(
    (s) => s.is_core && s.set_number === 1 && s.weight != null,
  );
  return set1 ? (set1.weight as number) : null;
}

/**
 * Decide qué hacer con el ciclo del bloque al completar la sesión:
 *  - si no hay peso de core serie 1 -> none
 *  - si no hay ciclo activo -> create (start=max=peso)
 *  - si hay ciclo y peso > max_weight -> update-max
 *  - en otro caso -> noop
 * Función pura → testeable.
 */
export function decideCycle(
  coreWeight: number | null,
  activeCycle: ActiveCycle | null,
): CycleDecision {
  if (coreWeight == null) {
    return { kind: "none" };
  }
  if (!activeCycle) {
    return { kind: "create", startWeight: coreWeight };
  }
  if (activeCycle.max_weight == null || coreWeight > activeCycle.max_weight) {
    return { kind: "update-max", cycleId: activeCycle.id, maxWeight: coreWeight };
  }
  return { kind: "noop" };
}
