"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Flame,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";

import {
  deleteExercise,
  moveExercise,
  restoreExercise,
  setCore,
  unsetCoreExercise,
  updateExercise,
} from "../actions";
import type { EditorExercise } from "../data";

export function ExerciseRow({
  exercise,
  accent,
  isFirst,
  isLast,
  archived = false,
}: {
  exercise: EditorExercise;
  accent: string;
  isFirst: boolean;
  isLast: boolean;
  archived?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Ha ocurrido un error.");
    });
  }

  function handleDelete() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await deleteExercise(exercise.id);
      // deleteExercise devuelve ok:false con mensaje informativo si archiva.
      if (!res.ok) setNotice(res.error ?? null);
    });
  }

  function handleEdit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateExercise(exercise.id, formData);
      if (!res.ok) setError(res.error);
      else setEditing(false);
    });
  }

  if (archived) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.01] px-3 py-2.5 opacity-60">
        <span className="min-w-0 flex-1 truncate text-sm text-white/50 line-through">
          {exercise.name}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => restoreExercise(exercise.id))}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/60 transition hover:bg-white/10 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restaurar
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <form
        action={handleEdit}
        className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
      >
        <input
          name="name"
          type="text"
          required
          defaultValue={exercise.name}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
        />
        <div className="mt-2 flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-white/60">
            <span>Series</span>
            <input
              name="target_sets"
              type="number"
              min={1}
              defaultValue={exercise.target_sets}
              className="w-14 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white disabled:opacity-60"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60"
          >
            Cancelar
          </button>
        </div>
        {error && (
          <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          aria-label={exercise.is_core ? "Quitar core" : "Marcar core"}
          onClick={() =>
            run(() =>
              exercise.is_core
                ? unsetCoreExercise(exercise.id)
                : setCore(exercise.id),
            )
          }
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40"
          style={
            exercise.is_core
              ? { background: `${accent}22`, color: accent }
              : { color: "rgba(255,255,255,0.3)" }
          }
        >
          <Flame className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {exercise.name}
          </p>
          <p className="text-xs text-white/40">
            {exercise.target_sets}{" "}
            {exercise.target_sets === 1 ? "serie" : "series"}
            {exercise.is_core && " · core"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <MiniBtn
            label="Subir"
            disabled={isFirst || pending}
            onClick={() => run(() => moveExercise(exercise.id, "up"))}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </MiniBtn>
          <MiniBtn
            label="Bajar"
            disabled={isLast || pending}
            onClick={() => run(() => moveExercise(exercise.id, "down"))}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </MiniBtn>
          <MiniBtn label="Editar" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </MiniBtn>
          <MiniBtn label="Eliminar" disabled={pending} onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </MiniBtn>
        </div>
      </div>

      {notice && (
        <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200/90">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

function MiniBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}
