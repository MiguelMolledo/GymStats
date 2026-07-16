"use client";

import { useRouter } from "next/navigation";

import { monthNames } from "./data";

const MESES = monthNames();

/**
 * Selectores año/mes. Al cambiar, navega a /historial?y=YYYY&m=MM.
 */
export function MonthSelector({
  year,
  month,
  minYear,
  maxYear,
}: {
  year: number;
  month: number;
  minYear: number;
  maxYear: number;
}) {
  const router = useRouter();

  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);

  const go = (y: number, m: number) => {
    router.push(`/historial?y=${y}&m=${String(m).padStart(2, "0")}`);
  };

  const selectClass =
    "appearance-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-white outline-none transition focus:border-white/25 [&>option]:bg-[#0a0a0a] [&>option]:text-white";

  return (
    <div className="flex items-center gap-2 px-5 pt-4">
      <select
        aria-label="Mes"
        value={month}
        onChange={(e) => go(year, Number(e.target.value))}
        className={`${selectClass} flex-1`}
      >
        {MESES.map((name, i) => (
          <option key={i} value={i + 1}>
            {name.charAt(0).toUpperCase() + name.slice(1)}
          </option>
        ))}
      </select>
      <select
        aria-label="Año"
        value={year}
        onChange={(e) => go(Number(e.target.value), month)}
        className={selectClass}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
