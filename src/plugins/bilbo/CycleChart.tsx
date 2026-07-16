"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CyclePoint } from "./progression";

type TooltipEntry = { payload: CyclePoint };

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0a0a0a]/95 px-3 py-2 text-xs shadow-lg shadow-black/50 backdrop-blur">
      <p className="font-semibold text-white">
        {p.label} · {p.dateLabel}
      </p>
      <p className="text-white/70">
        {p.weight} kg · {p.reps} reps
      </p>
    </div>
  );
}

/**
 * Gráfica de área del peso de la serie 1 por sesión del ciclo. Gradiente del
 * color del bloque, ejes minimalistas (labels S1..Sn). <2 puntos → mensaje.
 */
export function CycleChart({
  points,
  accent,
  height = 160,
}: {
  points: CyclePoint[];
  accent: string;
  height?: number;
}) {
  const gradientId = useId().replace(/:/g, "");

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-white/10 text-center text-xs text-white/35"
        style={{ height }}
      >
        Necesitas al menos 2 sesiones para ver la evolución.
      </div>
    );
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            domain={["dataMin - 5", "dataMax + 5"]}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: accent, strokeOpacity: 0.3 }}
          />
          <Area
            type="monotone"
            dataKey="weight"
            stroke={accent}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={{ r: 3, fill: accent, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: accent, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
