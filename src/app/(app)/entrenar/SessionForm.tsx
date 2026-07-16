"use client";

import { useState } from "react";
import { ChevronDown, Flame } from "lucide-react";

import { useSessionStore } from "@/features/active-session/store";
import { getPlugin } from "@/plugins/registry";

import type { EntrenarBlock, EntrenarExercise } from "./EntrenarClient";
import { SyncIndicator } from "./SyncIndicator";

export function SessionForm({
  block,
  exercises,
  template,
  finishing,
  onFinish,
}: {
  block: EntrenarBlock | null;
  exercises: EntrenarExercise[];
  template: { plugin_key: string; config: unknown };
  finishing: boolean;
  onFinish: () => void;
}) {
  const session = useSessionStore((s) => s.session);
  const sets = useSessionStore((s) => s.sets);
  const updateSetField = useSessionStore((s) => s.updateSetField);
  const updateSessionField = useSessionStore((s) => s.updateSessionField);
  const discardSession = useSessionStore((s) => s.discardSession);

  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (!session) return null;

  const plugin = getPlugin(template.plugin_key);
  const accent = block?.accent_color ?? "#6366f1";
  const coreExercise = exercises.find((e) => e.is_core) ?? null;

  // Reps de la serie 1 del core (para SessionExtras).
  const coreSet1 = coreExercise
    ? sets.find((s) => s.exercise_id === coreExercise.id && s.set_number === 1)
    : null;
  const coreSet1Reps = coreSet1?.reps ?? "";

  return (
    <div className="space-y-5 px-5 py-5 pb-8">
      {/* Cabecera del form */}
      <div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">{block?.emoji ?? "🏋️"}</span>
            <span className="truncate text-base font-semibold text-white">
              {block?.label ?? "Sesión"}
            </span>
          </div>
          <SyncIndicator />
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-white/40">
            Fecha
          </span>
          <input
            type="date"
            value={session.performed_on}
            onChange={(e) => updateSessionField("performed_on", e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-white/40">
            Nota de la sesión
          </span>
          <textarea
            value={session.notes}
            onChange={(e) => updateSessionField("notes", e.target.value)}
            rows={2}
            placeholder="¿Cómo fue el día?"
            className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/30"
          />
        </label>
      </div>

      {/* Widgets del plugin */}
      {plugin?.SessionExtras && (
        <plugin.SessionExtras
          config={template.config}
          coreExercise={
            coreExercise
              ? { id: coreExercise.id, name: coreExercise.name }
              : null
          }
          coreSet1Reps={coreSet1Reps}
        />
      )}

      {/* Ejercicios */}
      <div className="space-y-3">
        {exercises.map((ex) => (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            accent={accent}
            sets={sets.filter((s) => s.exercise_id === ex.id)}
            onSetField={updateSetField}
          />
        ))}
      </div>

      {/* Acciones */}
      <div className="space-y-2 pt-2">
        <button
          type="button"
          onClick={onFinish}
          disabled={finishing}
          className="w-full rounded-2xl bg-emerald-500 py-3.5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {finishing ? "Terminando…" : "Terminar entrenamiento"}
        </button>

        {confirmDiscard ? (
          <div className="space-y-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-3">
            <p className="text-sm text-red-200">
              ¿Descartar este entrenamiento? Se perderán los datos.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => discardSession()}
                className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white transition hover:bg-red-400"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="flex-1 rounded-xl border border-white/15 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDiscard(true)}
            className="w-full rounded-2xl border border-white/10 py-2.5 text-sm font-medium text-white/50 transition hover:bg-white/5 hover:text-white/70"
          >
            Descartar entrenamiento
          </button>
        )}
      </div>
    </div>
  );
}

function ExerciseCard({
  exercise,
  accent,
  sets,
  onSetField,
}: {
  exercise: EntrenarExercise;
  accent: string;
  sets: {
    id: string;
    set_number: number;
    weight: string;
    reps: string;
    notes: string;
  }[];
  onSetField: (
    id: string,
    field: "weight" | "reps" | "notes",
    value: string,
  ) => void;
}) {
  const [open, setOpen] = useState(true);
  const isCore = exercise.is_core;
  const ordered = [...sets].sort((a, b) => a.set_number - b.set_number);

  return (
    <div
      className={`overflow-hidden rounded-3xl border bg-white/[0.03] ${
        isCore ? "border-indigo-400/40" : "border-white/10"
      }`}
      style={isCore ? { boxShadow: `inset 0 0 0 1px ${accent}33` } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isCore && <Flame className="h-4 w-4 shrink-0 text-indigo-300" />}
          <span className="truncate text-sm font-semibold text-white">
            {exercise.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">
            {ordered.length}{" "}
            {ordered.length === 1 ? "serie" : "series"}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-white/40 transition ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="space-y-2 px-4 pb-4">
          <div className="grid grid-cols-[1.5rem_1fr_1fr_1.4fr] gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-white/30">
            <span>#</span>
            <span>Kg</span>
            <span>Reps</span>
            <span>Nota</span>
          </div>
          {ordered.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[1.5rem_1fr_1fr_1.4fr] items-center gap-2"
            >
              <span className="text-center text-xs font-semibold text-white/40">
                {s.set_number}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={s.weight}
                onChange={(e) => onSetField(s.id, "weight", e.target.value)}
                placeholder="—"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-center text-sm text-white outline-none placeholder:text-white/20 focus:border-white/30"
              />
              <input
                type="text"
                inputMode="numeric"
                value={s.reps}
                onChange={(e) => onSetField(s.id, "reps", e.target.value)}
                placeholder="—"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-center text-sm text-white outline-none placeholder:text-white/20 focus:border-white/30"
              />
              <input
                type="text"
                value={s.notes}
                onChange={(e) => onSetField(s.id, "notes", e.target.value)}
                placeholder="—"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/30"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
