import { describe, expect, it } from "vitest";

import { BILBO_DEFAULTS } from "./config";
import {
  closingData,
  cyclePoints,
  cycleStats,
  isInCloseZone,
  type CoreSet1Row,
  type CycleWindow,
} from "./progression";

const row = (over: Partial<CoreSet1Row>): CoreSet1Row => ({
  session_id: "s",
  performed_on: "2026-01-10",
  started_at: null,
  weight: 100,
  reps: 20,
  ...over,
});

describe("cyclePoints", () => {
  it("orders points chronologically and labels S1..Sn", () => {
    const rows: CoreSet1Row[] = [
      row({ session_id: "b", performed_on: "2026-01-15", weight: 105, reps: 18 }),
      row({ session_id: "a", performed_on: "2026-01-10", weight: 100, reps: 20 }),
      row({ session_id: "c", performed_on: "2026-01-20", weight: 110, reps: 15 }),
    ];
    const cycle: CycleWindow = {
      started_at: "2026-01-01",
      ended_at: null,
      status: "active",
    };
    const pts = cyclePoints(rows, cycle);
    expect(pts.map((p) => p.label)).toEqual(["S1", "S2", "S3"]);
    expect(pts.map((p) => p.weight)).toEqual([100, 105, 110]);
    expect(pts[0].dateLabel).toBe("10/01");
  });

  it("ended_at bounds the points to the closed window", () => {
    const rows: CoreSet1Row[] = [
      row({ performed_on: "2025-12-31", weight: 90, reps: 32 }), // antes del inicio
      row({ performed_on: "2026-01-05", weight: 100, reps: 28 }),
      row({ performed_on: "2026-01-15", weight: 110, reps: 12 }),
      row({ performed_on: "2026-01-20", weight: 60, reps: 30 }), // después del cierre
    ];
    const cycle: CycleWindow = {
      started_at: "2026-01-01",
      ended_at: "2026-01-15",
      status: "closed",
    };
    const pts = cyclePoints(rows, cycle);
    expect(pts).toHaveLength(2);
    expect(pts.map((p) => p.weight)).toEqual([100, 110]);
  });

  it("drops rows without weight or reps", () => {
    const rows: CoreSet1Row[] = [
      row({ performed_on: "2026-01-05", weight: null, reps: 20 }),
      row({ performed_on: "2026-01-06", weight: 100, reps: null }),
      row({ performed_on: "2026-01-07", weight: 100, reps: 20 }),
    ];
    const cycle: CycleWindow = {
      started_at: "2026-01-01",
      ended_at: null,
      status: "active",
    };
    expect(cyclePoints(rows, cycle)).toHaveLength(1);
  });

  it("uses started_at to break ties within the same day", () => {
    const rows: CoreSet1Row[] = [
      row({
        performed_on: "2026-01-10",
        started_at: "2026-01-10T18:00:00Z",
        weight: 105,
        reps: 18,
      }),
      row({
        performed_on: "2026-01-10",
        started_at: "2026-01-10T09:00:00Z",
        weight: 100,
        reps: 20,
      }),
    ];
    const cycle: CycleWindow = {
      started_at: "2026-01-01",
      ended_at: null,
      status: "active",
    };
    const pts = cyclePoints(rows, cycle);
    expect(pts.map((p) => p.weight)).toEqual([100, 105]);
  });
});

const mkPoints = (specs: Array<[number, number]>) =>
  cyclePoints(
    specs.map(([weight, reps], i) =>
      row({
        session_id: `s${i}`,
        performed_on: `2026-01-${String(i + 1).padStart(2, "0")}`,
        weight,
        reps,
      }),
    ),
    { started_at: "2026-01-01", ended_at: null, status: "active" },
  );

describe("cycleStats", () => {
  it("returns start, latest and best", () => {
    const pts = mkPoints([
      [100, 30],
      [110, 20],
      [105, 25],
    ]);
    const stats = cycleStats(pts);
    expect(stats.start?.weight).toBe(100);
    expect(stats.latest?.weight).toBe(105);
    expect(stats.best?.weight).toBe(110);
  });

  it("best breaks weight ties by more reps", () => {
    const pts = mkPoints([
      [110, 15],
      [110, 22],
      [110, 18],
    ]);
    const stats = cycleStats(pts);
    expect(stats.best?.reps).toBe(22);
  });

  it("empty points → all null", () => {
    expect(cycleStats([])).toEqual({ start: null, latest: null, best: null });
  });
});

describe("isInCloseZone", () => {
  it("true when latest reps ≤ floor", () => {
    const pts = mkPoints([
      [100, 30],
      [120, 12],
    ]);
    expect(isInCloseZone(cycleStats(pts).latest, BILBO_DEFAULTS)).toBe(true);
  });
  it("false when latest reps above floor", () => {
    const pts = mkPoints([[100, 30]]);
    expect(isInCloseZone(cycleStats(pts).latest, BILBO_DEFAULTS)).toBe(false);
  });
  it("false when no latest", () => {
    expect(isInCloseZone(null, BILBO_DEFAULTS)).toBe(false);
  });
});

describe("closingData", () => {
  it("max weight over the cycle and reps of the last session", () => {
    const pts = mkPoints([
      [100, 30],
      [125, 20],
      [120, 11],
    ]);
    expect(closingData(pts)).toEqual({ max_weight: 125, closing_reps: 11 });
  });
  it("null when no points", () => {
    expect(closingData([])).toBeNull();
  });
});
