"use client";

import { useState } from "react";
import { ChevronDown, Flame } from "lucide-react";

import {
  formatSessionDate,
  formatWeight,
  type HistorialExercise,
  type HistorialSession,
} from "./data";

function SetChip({
  setNumber,
  weight,
  reps,
  notes,
  accent,
}: {
  setNumber: number;
  weight: number | null;
  reps: number | null;
  notes: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-white/40">Set {setNumber}</p>
      <p className="mt-0.5 text-base font-semibold" style={{ color: accent }}>
        {formatWeight(weight)}
      </p>
      <p className="text-[11px] text-white/45">{reps ?? "—"} reps</p>
      {notes && <p className="mt-1 text-[11px] italic text-white/40">{notes}</p>}
    </div>
  );
}

function ExerciseGroup({
  exercise,
  accent,
}: {
  exercise: HistorialExercise;
  accent: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-1">
        <p className="text-sm font-medium text-white/80">{exercise.name}</p>
        {exercise.is_core && (
          <Flame className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
        )}
        <span className="ml-auto text-[11px] text-white/35">
          {exercise.sets.length} {exercise.sets.length === 1 ? "set" : "sets"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {exercise.sets.map((s) => (
          <SetChip
            key={s.set_number}
            setNumber={s.set_number}
            weight={s.weight}
            reps={s.reps}
            notes={s.notes}
            accent={accent}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Tarjeta de una sesión del historial, con detalle expandible (nota general +
 * sets agrupados por ejercicio en orden de position).
 */
export function SessionCard({ session }: { session: HistorialSession }) {
  const [open, setOpen] = useState(false);
  const accent = session.block.accent_color ?? "#6366f1";

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
      style={{ boxShadow: `inset 0 0 0 1px ${accent}22` }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}00)` }}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
          style={{ background: `${accent}22` }}
        >
          {session.block.emoji ?? "🏋️"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-white">
            {session.block.label}
          </p>
          <p className="truncate text-xs text-white/45">
            {formatSessionDate(session.performed_on)}
            {session.notes ? ` · ${session.notes}` : ""}
          </p>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-white/40 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-white/8 px-4 pb-4 pt-3">
          {session.notes && (
            <p className="mb-3 rounded-2xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5 text-sm text-white/70">
              {session.notes}
            </p>
          )}
          {session.exercises.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/40">
              Sesión sin series registradas.
            </p>
          ) : (
            <div className="space-y-4">
              {session.exercises.map((ex) => (
                <ExerciseGroup key={ex.id} exercise={ex} accent={accent} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
