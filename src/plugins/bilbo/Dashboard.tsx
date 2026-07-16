"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Dumbbell, Info, TrendingUp, X } from "lucide-react";

import type { DashboardProps } from "../types";
import { CloseCycleButton } from "./CloseCycleButton";
import { CycleChart } from "./CycleChart";
import type { BilboConfig } from "./config";
import type { BilboBlockData, BilboDashboardData } from "./data";
import { cyclePoints, cycleStats, isInCloseZone } from "./progression";

function fmtWeight(w: number | null): string {
  if (w == null) return "—";
  return `${w} kg`;
}

function MethodologyPanel({
  config,
  onClose,
}: {
  config: BilboConfig;
  onClose: () => void;
}) {
  return (
    <div className="mx-5 mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Metodología Core {config.target_reps}</p>
          <p className="mt-0.5 text-xs text-white/45">Cómo se mide tu progreso</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/40 hover:bg-white/5 hover:text-white/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="mt-3 space-y-2 text-sm text-white/60">
        <li className="flex gap-2">
          <span className="text-white/30">1.</span>
          Solo cuenta la <span className="text-white/80">serie 1 del ejercicio core</span> de cada bloque.
        </li>
        <li className="flex gap-2">
          <span className="text-white/30">2.</span>
          Empiezas apuntando a <span className="text-white/80">{config.target_reps} reps</span> y subes peso cada sesión.
        </li>
        <li className="flex gap-2">
          <span className="text-white/30">3.</span>
          Cuando caes a <span className="text-white/80">≤ {config.floor_reps} reps</span>, cierra el ciclo y empieza uno nuevo.
        </li>
      </ul>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  color,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  highlight?: "core" | "warn";
}) {
  const valueColor =
    highlight === "warn"
      ? "#fb923c"
      : highlight === "core"
        ? (color ?? "#fff")
        : "#fff";
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 text-lg font-semibold" style={{ color: valueColor }}>
        {value}
      </p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  );
}

function BlockCard({
  item,
  config,
}: {
  item: BilboBlockData;
  config: BilboConfig;
}) {
  const { block, cycle, rows } = item;
  const accent = block.accent_color ?? "#6366f1";

  const points = cycle
    ? cyclePoints(rows, {
        started_at: cycle.started_at,
        ended_at: cycle.ended_at,
        status: cycle.status,
      })
    : [];
  const stats = cycleStats(points);
  const inCloseZone =
    cycle?.status === "active" && isInCloseZone(stats.latest, config);
  const isActive = cycle?.status === "active";

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5"
      style={{ boxShadow: `inset 0 0 0 1px ${accent}22` }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}00)` }}
      />

      {/* Cabecera */}
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
          {isActive ? "Ciclo Activo" : "Sin ciclo"}
        </span>
      </div>

      {points.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center">
          <p className="text-sm text-white/50">Inicia tu primer entrenamiento</p>
          <Link
            href={`/entrenar?bloque=${block.slug}`}
            className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition"
            style={{ background: accent }}
          >
            <Dumbbell className="h-4 w-4" />
            Entrenar
          </Link>
        </div>
      ) : (
        <>
          {/* Métricas: grid 2 + 1 */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric
              label="Máximo alcanzado"
              value={fmtWeight(stats.best?.weight ?? null)}
              sub={stats.best ? `${stats.best.reps} reps · ${stats.best.dateLabel}` : undefined}
              color={accent}
              highlight="core"
            />
            <Metric
              label="Última sesión"
              value={fmtWeight(stats.latest?.weight ?? null)}
              sub={stats.latest ? `${stats.latest.reps} reps · ${stats.latest.dateLabel}` : undefined}
              highlight={inCloseZone ? "warn" : undefined}
            />
          </div>
          <div className="mt-2">
            <Metric
              label="Punto de partida del ciclo"
              value={fmtWeight(stats.start?.weight ?? null)}
              sub={stats.start ? `${stats.start.reps} reps · ${stats.start.dateLabel}` : undefined}
            />
          </div>

          {inCloseZone && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3.5 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-xs text-amber-200/90">
                Rendimiento en {stats.latest?.reps} reps. Considera cerrar el ciclo.
              </p>
            </div>
          )}

          {/* Gráfica */}
          <div className="mt-4">
            <CycleChart points={points} accent={accent} />
          </div>
        </>
      )}

      {/* Botones */}
      <div className="mt-4 flex gap-2">
        <Link
          href={`/entrenar?bloque=${block.slug}`}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition"
          style={{ background: accent }}
        >
          <Dumbbell className="h-4 w-4" />
          Entrenar
        </Link>
        {isActive && cycle && (
          <CloseCycleButton cycleId={cycle.id} className="flex-1" />
        )}
      </div>
    </div>
  );
}

export function BilboDashboard({ data }: DashboardProps) {
  const dashboard = data as BilboDashboardData;
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-2 text-white/50">
          <TrendingUp className="h-4 w-4" />
          <p className="text-xs font-medium uppercase tracking-wide">Progreso por bloque</p>
        </div>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          aria-label="Metodología"
          aria-expanded={showInfo}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 hover:text-white/80"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      {showInfo && (
        <MethodologyPanel config={dashboard.config} onClose={() => setShowInfo(false)} />
      )}

      <div className="mt-4 space-y-4 px-5">
        {dashboard.blocks.map((item) => (
          <BlockCard key={item.block.id} item={item} config={dashboard.config} />
        ))}
      </div>
    </div>
  );
}
