import { describe, expect, it } from "vitest";

import {
  isSetEmpty,
  parseReps,
  parseWeight,
  prefillWeight,
  selectSetsToSync,
  type LocalSet,
} from "./logic";

const baseSet = (over: Partial<LocalSet>): LocalSet => ({
  id: "s1",
  session_id: "sess1",
  exercise_id: "ex1",
  exercise_name: "Press",
  set_number: 1,
  weight: "",
  reps: "",
  notes: "",
  dirty: 1,
  updated_at: "2026-07-16T00:00:00.000Z",
  ...over,
});

describe("parseWeight", () => {
  it("empty string -> null", () => {
    expect(parseWeight("")).toBeNull();
    expect(parseWeight("   ")).toBeNull();
  });
  it("parses integers and decimals", () => {
    expect(parseWeight("80")).toBe(80);
    expect(parseWeight("82.5")).toBe(82.5);
  });
  it("accepts comma decimal separator", () => {
    expect(parseWeight("82,5")).toBe(82.5);
  });
  it("rounds to 2 decimals", () => {
    expect(parseWeight("80.005")).toBe(80.01);
  });
  it("invalid -> null", () => {
    expect(parseWeight("abc")).toBeNull();
  });
});

describe("parseReps", () => {
  it("empty -> null", () => {
    expect(parseReps("")).toBeNull();
  });
  it("truncates to integer", () => {
    expect(parseReps("12")).toBe(12);
    expect(parseReps("12.9")).toBe(12);
  });
  it("invalid -> null", () => {
    expect(parseReps("xx")).toBeNull();
  });
});

describe("isSetEmpty", () => {
  it("all blank -> empty", () => {
    expect(isSetEmpty({ weight: "", reps: "", notes: "  " })).toBe(true);
  });
  it("any field present -> not empty", () => {
    expect(isSetEmpty({ weight: "80", reps: "", notes: "" })).toBe(false);
    expect(isSetEmpty({ weight: "", reps: "10", notes: "" })).toBe(false);
    expect(isSetEmpty({ weight: "", reps: "", notes: "ok" })).toBe(false);
  });
});

describe("selectSetsToSync", () => {
  it("excludes empty sets even if dirty", () => {
    const sets = [
      baseSet({ id: "a", weight: "", reps: "", notes: "", dirty: 1 }),
      baseSet({ id: "b", weight: "80", reps: "12", notes: "", dirty: 1 }),
    ];
    const out = selectSetsToSync(sets);
    expect(out.map((s) => s.id)).toEqual(["b"]);
  });
  it("excludes non-dirty sets", () => {
    const sets = [
      baseSet({ id: "a", weight: "80", reps: "10", dirty: 0 }),
      baseSet({ id: "b", weight: "80", reps: "10", dirty: 1 }),
    ];
    expect(selectSetsToSync(sets).map((s) => s.id)).toEqual(["b"]);
  });
  it("converts types on the payload", () => {
    const sets = [
      baseSet({ id: "b", weight: "82,5", reps: "12.7", notes: " duro " }),
    ];
    const [payload] = selectSetsToSync(sets);
    expect(payload.weight).toBe(82.5);
    expect(payload.reps).toBe(12);
    expect(payload.notes).toBe("duro");
  });
  it("dirty set with only reps is synced with null weight", () => {
    const sets = [baseSet({ id: "b", weight: "", reps: "10", notes: "" })];
    const [payload] = selectSetsToSync(sets);
    expect(payload.weight).toBeNull();
    expect(payload.reps).toBe(10);
  });
});

describe("prefillWeight", () => {
  const prev = [
    { exercise_id: "ex1", set_number: 1, weight: 80 },
    { exercise_id: "ex1", set_number: 2, weight: 82.5 },
    { exercise_id: "ex2", set_number: 1, weight: 50 },
  ];
  it("exact match by exercise + set_number", () => {
    expect(prefillWeight(prev, "ex1", 2)).toBe("82.5");
  });
  it("falls back to set 1 when no match for set_number", () => {
    expect(prefillWeight(prev, "ex1", 3)).toBe("80");
  });
  it("returns empty string when exercise has no data", () => {
    expect(prefillWeight(prev, "ex3", 1)).toBe("");
  });
  it("ignores null weights in exact match, falls back to set 1", () => {
    const p = [
      { exercise_id: "ex1", set_number: 1, weight: 60 },
      { exercise_id: "ex1", set_number: 2, weight: null },
    ];
    expect(prefillWeight(p, "ex1", 2)).toBe("60");
  });
});
