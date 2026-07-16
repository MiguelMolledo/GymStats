import { CalendarRange } from "lucide-react";

import { Header } from "@/components/Header";
import { createClient } from "@/lib/supabase/server";

import {
  firstSessionYear,
  loadMonthSessions,
  monthName,
  summarize,
} from "./data";
import { MonthSelector } from "./MonthSelector";
import { SessionCard } from "./SessionCard";

type SearchParams = Promise<{ y?: string; m?: string }>;

function clampMonth(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : fallback;
}

function clampYear(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2000 && n <= 3000 ? n : fallback;
}

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const year = clampYear(params.y, currentYear);
  const month = clampMonth(params.m, currentMonth);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <Header title="Historial" subtitle="Tus entrenamientos anteriores" />
        <div className="px-6 py-24 text-center text-sm text-white/40">
          Inicia sesión para ver tu historial.
        </div>
      </>
    );
  }

  const [sessions, minYear] = await Promise.all([
    loadMonthSessions(supabase, user.id, year, month),
    firstSessionYear(supabase, user.id, currentYear),
  ]);

  const maxYear = Math.max(currentYear, year);
  const summary = summarize(sessions);
  const label = `${monthName(month)} ${year}`;

  return (
    <>
      <Header title="Historial" subtitle="Tus entrenamientos anteriores" />

      <MonthSelector
        year={year}
        month={month}
        minYear={Math.min(minYear, year)}
        maxYear={maxYear}
      />

      {sessions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
            <CalendarRange className="h-6 w-6 text-white/40" />
          </div>
          <p className="text-sm text-white/40">Sin entrenamientos en {label}.</p>
        </div>
      ) : (
        <div className="space-y-4 px-5 pt-4">
          {/* Resumen del mes */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-white/40">
                Resumen · {label}
              </p>
              <p className="text-sm text-white/50">
                <span className="text-lg font-semibold text-white">
                  {summary.total}
                </span>{" "}
                {summary.total === 1 ? "sesión" : "sesiones"}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {summary.blocks.map((b) => {
                const accent = b.accent_color ?? "#6366f1";
                return (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
                    style={{ background: `${accent}1f`, color: accent }}
                  >
                    <span>{b.emoji ?? "🏋️"}</span>
                    <span className="text-white/80">{b.label}</span>
                    <span className="font-semibold" style={{ color: accent }}>
                      {b.count}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Lista de sesiones */}
          <div className="space-y-3">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
