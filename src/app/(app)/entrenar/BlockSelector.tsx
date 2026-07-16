"use client";

import { ChevronRight } from "lucide-react";

import type { EntrenarBlock, EntrenarExercise } from "./EntrenarClient";

/** Selector de bloque: tarjetas grandes glass con acento del bloque. */
export function BlockSelector({
  blocks,
  exercisesByBlock,
  onSelect,
}: {
  blocks: EntrenarBlock[];
  exercisesByBlock: Map<string, EntrenarExercise[]>;
  onSelect: (block: EntrenarBlock) => void;
}) {
  return (
    <div className="space-y-3 px-5 py-5">
      <p className="px-1 text-xs font-medium uppercase tracking-wide text-white/40">
        Elige un bloque
      </p>
      {blocks.map((block) => {
        const exercises = exercisesByBlock.get(block.id) ?? [];
        const core = exercises.find((e) => e.is_core);
        const accent = block.accent_color ?? "#6366f1";
        return (
          <button
            key={block.id}
            type="button"
            onClick={() => onSelect(block)}
            className="group relative flex w-full items-center gap-4 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition hover:bg-white/[0.06]"
            style={{
              boxShadow: `inset 0 0 0 1px ${accent}22`,
            }}
          >
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-1"
              style={{ background: accent }}
            />
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
              style={{ background: `${accent}1f` }}
            >
              {block.emoji ?? "🏋️"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-white">
                {block.label}
              </p>
              {core && (
                <p className="truncate text-sm text-white/45">{core.name}</p>
              )}
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/30 transition group-hover:text-white/60" />
          </button>
        );
      })}
    </div>
  );
}
