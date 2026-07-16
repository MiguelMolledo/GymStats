import { describe, expect, it } from "vitest";

import type { CompletedSet } from "../types";
import { coreSet1Weight, decideCycle } from "./cycle-logic";
import { parseBilboConfig, BILBO_DEFAULTS } from "./config";

const set = (over: Partial<CompletedSet>): CompletedSet => ({
  exercise_id: "core",
  set_number: 1,
  weight: 100,
  reps: 20,
  notes: "",
  is_core: true,
  ...over,
});

describe("parseBilboConfig", () => {
  it("defaults when raw is not an object", () => {
    expect(parseBilboConfig(null)).toEqual(BILBO_DEFAULTS);
    expect(parseBilboConfig(undefined)).toEqual(BILBO_DEFAULTS);
    expect(parseBilboConfig(42)).toEqual(BILBO_DEFAULTS);
  });
  it("reads provided values", () => {
    expect(parseBilboConfig({ target_reps: 40, floor_reps: 15 })).toEqual({
      target_reps: 40,
      floor_reps: 15,
    });
  });
  it("falls back per-field on invalid values", () => {
    expect(parseBilboConfig({ target_reps: "x", floor_reps: 0 })).toEqual(
      BILBO_DEFAULTS,
    );
  });
  it("coerces numeric strings and rounds", () => {
    expect(parseBilboConfig({ target_reps: "32", floor_reps: 12.4 })).toEqual({
      target_reps: 32,
      floor_reps: 12,
    });
  });
});

describe("coreSet1Weight", () => {
  it("returns weight of core set 1", () => {
    const sets = [
      set({ exercise_id: "core", set_number: 1, weight: 90 }),
      set({ exercise_id: "core", set_number: 2, weight: 95 }),
      set({ exercise_id: "acc", set_number: 1, weight: 30, is_core: false }),
    ];
    expect(coreSet1Weight(sets)).toBe(90);
  });
  it("null when no core set 1 with weight", () => {
    expect(coreSet1Weight([set({ set_number: 2 })])).toBeNull();
    expect(coreSet1Weight([set({ weight: null })])).toBeNull();
    expect(coreSet1Weight([])).toBeNull();
  });
});

describe("decideCycle", () => {
  it("none when no core weight", () => {
    expect(decideCycle(null, null)).toEqual({ kind: "none" });
  });
  it("creates when no active cycle", () => {
    expect(decideCycle(100, null)).toEqual({ kind: "create", startWeight: 100 });
  });
  it("updates max when weight beats current max", () => {
    expect(decideCycle(110, { id: "c1", max_weight: 100 })).toEqual({
      kind: "update-max",
      cycleId: "c1",
      maxWeight: 110,
    });
  });
  it("updates max when current max is null", () => {
    expect(decideCycle(80, { id: "c1", max_weight: null })).toEqual({
      kind: "update-max",
      cycleId: "c1",
      maxWeight: 80,
    });
  });
  it("noop when weight does not beat max", () => {
    expect(decideCycle(90, { id: "c1", max_weight: 100 })).toEqual({
      kind: "noop",
    });
    expect(decideCycle(100, { id: "c1", max_weight: 100 })).toEqual({
      kind: "noop",
    });
  });
});
