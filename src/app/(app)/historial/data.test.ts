import { describe, expect, it } from "vitest";

import {
  formatSessionDate,
  formatWeight,
  groupSets,
  monthName,
  monthRange,
  summarize,
  type HistorialSession,
} from "./data";

describe("formatSessionDate", () => {
  it("formats YYYY-MM-DD as es-ES short date", () => {
    expect(formatSessionDate("2026-06-30")).toBe("30 jun 2026");
    expect(formatSessionDate("2026-01-05")).toBe("5 ene 2026");
    expect(formatSessionDate("2026-12-31")).toBe("31 dic 2026");
  });

  it("tolerates ISO timestamps (takes date part)", () => {
    expect(formatSessionDate("2026-06-30T18:00:00.000Z")).toBe("30 jun 2026");
  });
});

describe("formatWeight", () => {
  it("drops decimals for integers, keeps them otherwise", () => {
    expect(formatWeight(82)).toBe("82 kg");
    expect(formatWeight(82.5)).toBe("82.5 kg");
  });

  it("renders null as dash", () => {
    expect(formatWeight(null)).toBe("—");
  });
});

describe("monthName", () => {
  it("maps 1..12 to spanish names", () => {
    expect(monthName(1)).toBe("enero");
    expect(monthName(6)).toBe("junio");
    expect(monthName(12)).toBe("diciembre");
  });
});

describe("monthRange", () => {
  it("returns half-open range within the year", () => {
    expect(monthRange(2026, 6)).toEqual({ from: "2026-06-01", to: "2026-07-01" });
  });

  it("rolls over to next year in december", () => {
    expect(monthRange(2026, 12)).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });
});

const session = (over: Partial<HistorialSession>): HistorialSession => ({
  id: "s1",
  performed_on: "2026-06-10",
  notes: "",
  block: { id: "b1", label: "Pecho", emoji: "💪", accent_color: "#f00" },
  exercises: [],
  ...over,
});

describe("summarize", () => {
  it("counts total and per-block in first-seen order", () => {
    const sessions = [
      session({ id: "a", block: { id: "b1", label: "Pecho", emoji: "💪", accent_color: "#f00" } }),
      session({ id: "b", block: { id: "b2", label: "Espalda", emoji: "🦾", accent_color: "#0f0" } }),
      session({ id: "c", block: { id: "b1", label: "Pecho", emoji: "💪", accent_color: "#f00" } }),
    ];
    const summary = summarize(sessions);
    expect(summary.total).toBe(3);
    expect(summary.blocks).toHaveLength(2);
    expect(summary.blocks[0]).toMatchObject({ id: "b1", count: 2 });
    expect(summary.blocks[1]).toMatchObject({ id: "b2", count: 1 });
  });

  it("handles no sessions", () => {
    expect(summarize([])).toEqual({ total: 0, blocks: [] });
  });
});

describe("groupSets", () => {
  const exercises = new Map([
    ["ex1", { id: "ex1", name: "Press", is_core: true, position: 0 }],
    ["ex2", { id: "ex2", name: "Aperturas", is_core: false, position: 1 }],
  ]);

  it("groups by exercise in position order, sets by set_number", () => {
    const sets = [
      { session_id: "s", exercise_id: "ex2", set_number: 2, weight: 20, reps: 12, notes: "" },
      { session_id: "s", exercise_id: "ex1", set_number: 2, weight: 82, reps: 8, notes: "" },
      { session_id: "s", exercise_id: "ex1", set_number: 1, weight: 80, reps: 10, notes: "ok" },
      { session_id: "s", exercise_id: "ex2", set_number: 1, weight: 18, reps: 15, notes: "" },
    ];
    const grouped = groupSets(sets, exercises);
    expect(grouped.map((e) => e.id)).toEqual(["ex1", "ex2"]);
    expect(grouped[0].is_core).toBe(true);
    expect(grouped[0].sets.map((s) => s.set_number)).toEqual([1, 2]);
    expect(grouped[0].sets[0].notes).toBe("ok");
    expect(grouped[1].sets.map((s) => s.set_number)).toEqual([1, 2]);
  });

  it("ignores sets of unknown exercises", () => {
    const sets = [
      { session_id: "s", exercise_id: "ghost", set_number: 1, weight: 10, reps: 5, notes: "" },
      { session_id: "s", exercise_id: "ex1", set_number: 1, weight: 80, reps: 10, notes: "" },
    ];
    const grouped = groupSets(sets, exercises);
    expect(grouped.map((e) => e.id)).toEqual(["ex1"]);
  });
});
