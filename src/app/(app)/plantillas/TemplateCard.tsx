"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, Pencil, Trash2 } from "lucide-react";

import { deleteTemplate, duplicateTemplate, useTemplate } from "./actions";
import type { TemplateSummary } from "./data";

export function TemplateCard({ template }: { template: TemplateSummary }) {
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Ha ocurrido un error.");
    });
  }

  const ownerBadge = template.isSystem
    ? { text: "Sistema", cls: "bg-amber-500/15 text-amber-300" }
    : template.isOwn
      ? { text: "Tuya", cls: "bg-emerald-500/15 text-emerald-300" }
      : {
          text: `De ${template.ownerName ?? "otro usuario"}`,
          cls: "bg-white/8 text-white/50",
        };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-white">
            {template.name}
          </p>
          <p className="mt-0.5 text-xs text-white/45">
            {template.blockCount}{" "}
            {template.blockCount === 1 ? "bloque" : "bloques"} ·{" "}
            {template.exerciseCount}{" "}
            {template.exerciseCount === 1 ? "ejercicio" : "ejercicios"}
          </p>
        </div>
        {template.isActive && (
          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            ACTIVA
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-300">
          {template.pluginName}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${ownerBadge.cls}`}
        >
          {ownerBadge.text}
        </span>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {template.isActive ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3.5 py-2 text-sm font-medium text-emerald-300">
            <Check className="h-4 w-4" />
            En uso
          </span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => useTemplate(template.id))}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-3.5 py-2 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            Usar
          </button>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => duplicateTemplate(template.id))}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 disabled:opacity-60"
        >
          <Copy className="h-4 w-4" />
          Duplicar
        </button>

        {template.isOwn && (
          <>
            <Link
              href={`/plantillas/${template.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Link>

            {confirmDelete ? (
              <span className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deleteTemplate(template.id))}
                  className="rounded-xl bg-red-500/90 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-2 text-sm font-medium text-red-300/80 transition hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
