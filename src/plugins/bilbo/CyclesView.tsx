"use client";

import { useMemo, useState } from "react";

import type { ExtraViewProps } from "../types";
import { CloseCycleButton } from "./CloseCycleButton";
import { CycleChart } from "./CycleChart";
import type { BilboBlock, BilboCycle, BilboCyclesData } from "./data";
import { cyclePoints, cycleStats, type CyclePoint } from "./progression";

function fmtWeight(w: number | null | undefined): string {
  if (w == null) return "—";
  return `${w} kg`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  if (d.length !== 3) return iso;
  return `${d[2]}/${d[1]}/${d[0]}`;
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-0.5 text-base font-semibold" style={{ color: color ?? "#fff" }}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-white/40">{sub}</p>}
    </div>
  );
}

function CycleCard({
  cycle,
  block,
  points,
}: {
  cycle: BilboCycle;
  block: BilboBlock;
  points: CyclePoint[];
}) {
  const accent = block.accent_color ?? "#6366f1";
  const stats = cycleStats(points);
  const isActive = cycle.status === "active";

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5"
      style={{ boxShadow: `inset 0 0 0 1px ${accent}22` }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}00)` }}
      />
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
          style={{ background: `${accent}22` }}
        >
          {block.emoji ?? "🏋️"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-white">{block.label}</p>
          {block.core && (
            <p className="truncate text-xs text-white/45">🔥 {block.core.name} (S1)</p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={
            isActive
              ? { background: `${accent}22`, color: accent }
              : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }
          }
        >
          {isActive ? "Activo" : "Completado"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric
          label="Inicio S1"
          value={fmtWeight(stats.start?.weight ?? cycle.start_weight)}
          sub={stats.start ? `${stats.start.reps} reps` : undefined}
        />
        <Metric
          label="High Score S1"
          value={fmtWeight(stats.best?.weight ?? cycle.max_weight)}
          sub={stats.best ? `${stats.best.reps} reps` : undefined}
          color={accent}
        />
        <Metric
          label={isActive ? "Último S1" : "Cierre S1"}
          value={fmtWeight(stats.latest?.weight)}
          sub={
            stats.latest
              ? `${stats.latest.reps} reps`
              : cycle.closing_reps != null
                ? `${cycle.closing_reps} reps`
                : undefined
          }
        />
      </div>

      <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-white/40">
        <span>{points.length} sesiones</span>
        <span>
          {isActive ? "Iniciado" : "Cerrado"}: {fmtDate(isActive ? cycle.started_at : cycle.ended_at)}
        </span>
      </div>

      {points.length > 0 && (
        <div className="mt-3">
          <CycleChart points={points} accent={accent} height={140} />
        </div>
      )}

      {points.length > 0 && (
        <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-white/8 bg-white/[0.02] p-2">
          {[...points].reverse().map((p) => (
            <div
              key={`${p.label}-${p.performed_on}`}
              className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm"
            >
              <span className="text-white/50">
                {p.label} · {p.dateLabel}
              </span>
              <span className="text-white/80">
                {p.reps} reps · <span className="font-medium">{p.weight} kg</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {isActive && <CloseCycleButton cycleId={cycle.id} className="mt-3" />}
    </div>
  );
}

export function BilboCyclesView({ data }: ExtraViewProps) {
  const cyclesData = data as BilboCyclesData;
  const [filter, setFilter] = useState<string>("todos");

  const blockById = useMemo(
    () => new Map(cyclesData.blocks.map((b) => [b.id, b])),
    [cyclesData.blocks],
  );

  const cyclesWithPoints = useMemo(() => {
    return cyclesData.cycles
      .map((cycle) => {
        const block = blockById.get(cycle.block_id);
        if (!block) return null;
        const rows = cyclesData.rowsByBlock[cycle.block_id] ?? [];
        const points = cyclePoints(rows, {
          started_at: cycle.started_at,
          ended_at: cycle.ended_at,
          status: cycle.status,
        });
        return { cycle, block, points };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [cyclesData, blockById]);

  const visible = cyclesWithPoints.filter(
    (c) => filter === "todos" || c.block.slug === filter,
  );

  return (
    <div className="pb-6">
      {/* Filtros chip */}
      <div className="flex gap-2 overflow-x-auto px-5 py-4">
        <FilterChip active={filter === "todos"} onClick={() => setFilter("todos")}>
          Todos
        </FilterChip>
        {cyclesData.blocks.map((b) => (
          <FilterChip
            key={b.id}
            active={filter === b.slug}
            accent={b.accent_color ?? undefined}
            onClick={() => setFilter(b.slug)}
          >
            {b.emoji ? `${b.emoji} ` : ""}
            {b.label}
          </FilterChip>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-white/40">
          Aún no tienes ciclos. Completa entrenamientos para empezar uno.
        </div>
      ) : (
        <div className="space-y-4 px-5">
          {visible.map(({ cycle, block, points }) => (
            <CycleCard key={cycle.id} cycle={cycle} block={block} points={points} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  accent,
  onClick,
  children,
}: {
  active: boolean;
  accent?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition"
      style={
        active
          ? {
              background: accent ? `${accent}22` : "rgba(255,255,255,0.12)",
              color: accent ?? "#fff",
              borderColor: accent ? `${accent}55` : "rgba(255,255,255,0.2)",
            }
          : {
              background: "transparent",
              color: "rgba(255,255,255,0.5)",
              borderColor: "rgba(255,255,255,0.1)",
            }
      }
    >
      {children}
    </button>
  );
}
