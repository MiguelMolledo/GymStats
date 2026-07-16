"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  addExercise,
  deleteBlock,
  moveBlock,
  updateBlock,
} from "../actions";
import type { EditorBlock } from "../data";
import { DEFAULT_ACCENT } from "../logic";
import { AccentPicker } from "./AccentPicker";
import { ExerciseRow } from "./ExerciseRow";

export function BlockEditor({
  templateId,
  block,
  isFirst,
  isLast,
}: {
  templateId: string;
  block: EditorBlock;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [accent, setAccent] = useState<string>(
    block.accent_color ?? DEFAULT_ACCENT,
  );
  const [addingEx, setAddingEx] = useState(false);
  const [pending, startTransition] = useTransition();

  const accentColor = block.accent_color ?? DEFAULT_ACCENT;
  const active = block.exercises.filter((e) => !e.archived);
  const archived = block.exercises.filter((e) => e.archived);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Ha ocurrido un error.");
    });
  }

  function handleEditBlock(formData: FormData) {
    setError(null);
    formData.set("accent_color", accent);
    startTransition(async () => {
      const res = await updateBlock(block.id, formData);
      if (!res.ok) setError(res.error);
      else setEditing(false);
    });
  }

  function handleAddExercise(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addExercise(block.id, formData);
      if (!res.ok) setError(res.error);
      else setAddingEx(false);
    });
  }

  return (
    <div
      className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
      style={{ boxShadow: `inset 0 0 0 1px ${accentColor}22` }}
    >
      <div
        className="h-1"
        style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}00)` }}
      />

      <div className="p-5">
        {editing ? (
          <form action={handleEditBlock}>
            <div className="flex gap-3">
              <input
                name="emoji"
                type="text"
                maxLength={4}
                defaultValue={block.emoji ?? ""}
                placeholder="🏋️"
                className="w-16 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-white outline-none focus:border-white/30"
              />
              <input
                name="label"
                type="text"
                required
                defaultValue={block.label}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-white/30"
              />
            </div>
            <div className="mt-3">
              <AccentPicker value={accent} onChange={setAccent} />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-60"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
              style={{ background: `${accentColor}22` }}
            >
              {block.emoji ?? "🏋️"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-white">
                {block.label}
              </p>
              <p className="truncate text-xs text-white/40">/{block.slug}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconBtn
                label="Subir"
                disabled={isFirst || pending}
                onClick={() => run(() => moveBlock(block.id, "up"))}
              >
                <ChevronUp className="h-4 w-4" />
              </IconBtn>
              <IconBtn
                label="Bajar"
                disabled={isLast || pending}
                onClick={() => run(() => moveBlock(block.id, "down"))}
              >
                <ChevronDown className="h-4 w-4" />
              </IconBtn>
              <IconBtn label="Editar bloque" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
              </IconBtn>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        {/* Ejercicios */}
        <div className="mt-4 space-y-2">
          {active.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-xs text-white/35">
              Sin ejercicios en este bloque.
            </p>
          ) : (
            active.map((ex, i) => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                accent={accentColor}
                isFirst={i === 0}
                isLast={i === active.length - 1}
              />
            ))
          )}
        </div>

        {archived.length > 0 && (
          <ArchivedSection exercises={archived} accent={accentColor} />
        )}

        {/* Añadir ejercicio */}
        {addingEx ? (
          <form
            action={handleAddExercise}
            className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4"
          >
            <input
              name="name"
              type="text"
              required
              autoFocus
              placeholder="Nombre del ejercicio"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-white/30"
            />
            <div className="mt-3 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-white/60">
                <span>Series</span>
                <input
                  name="target_sets"
                  type="number"
                  min={1}
                  defaultValue={1}
                  className="w-16 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-white outline-none focus:border-white/30"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-white/60">
                <input
                  name="is_core"
                  type="checkbox"
                  className="h-4 w-4 accent-white"
                />
                <span>🔥 Core</span>
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-60"
              >
                Añadir
              </button>
              <button
                type="button"
                onClick={() => setAddingEx(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingEx(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/12 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            <Plus className="h-4 w-4" />
            Añadir ejercicio
          </button>
        )}

        {/* Eliminar bloque */}
        <div className="mt-4 border-t border-white/5 pt-3">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">¿Eliminar el bloque?</span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const res = await deleteBlock(block.id);
                    if (!res.ok) setConfirmDelete(false);
                    return res;
                  })
                }
                className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
              >
                Sí, eliminar
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-300/70 transition hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar bloque
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ArchivedSection({
  exercises,
  accent,
}: {
  exercises: EditorBlock["exercises"];
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-white/40 transition hover:text-white/60"
      >
        {open ? <X className="h-3.5 w-3.5" /> : null}
        {open ? "Ocultar" : `Ver archivados (${exercises.length})`}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {exercises.map((ex) => (
            <ExerciseRow
              key={ex.id}
              exercise={ex}
              accent={accent}
              isFirst
              isLast
              archived
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({
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
      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}
