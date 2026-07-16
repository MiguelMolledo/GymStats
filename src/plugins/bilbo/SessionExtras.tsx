"use client";

import { Flame } from "lucide-react";

import type { SessionExtrasProps } from "../types";
import { parseBilboConfig } from "./config";

/**
 * Widget BILBO bajo la cabecera del form: contador destacado de la meta de la
 * serie 1 del core y aviso de zona de cierre de ciclo.
 */
export function BilboSessionExtras({
  config,
  coreExercise,
  coreSet1Reps,
}: SessionExtrasProps) {
  if (!coreExercise) return null;
  const { target_reps, floor_reps } = parseBilboConfig(config);
  const reps = coreSet1Reps.trim() === "" ? null : Number(coreSet1Reps);
  const hasReps = reps != null && Number.isFinite(reps);
  const reached = hasReps && (reps as number) >= target_reps;
  const inClosingZone = hasReps && (reps as number) <= floor_reps;

  return (
    <div className="space-y-2">
      <div
        className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
          reached
            ? "border-emerald-400/40 bg-emerald-500/10"
            : "border-indigo-400/30 bg-indigo-500/10"
        }`}
      >
        <div className="flex items-center gap-2">
          <Flame
            className={`h-4 w-4 ${reached ? "text-emerald-300" : "text-indigo-300"}`}
          />
          <span className="text-sm font-medium text-white/80">
            Meta Serie 1: {coreExercise.name}
          </span>
        </div>
        <span
          className={`text-lg font-bold tabular-nums ${
            reached ? "text-emerald-300" : "text-white"
          }`}
        >
          {hasReps ? reps : 0}
          <span className="text-sm font-normal text-white/40">
            /{target_reps}
          </span>
        </span>
      </div>

      {inClosingZone && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
          Estás en zona de cierre de ciclo (serie 1 ≤ {floor_reps} reps).
        </div>
      )}
    </div>
  );
}
