"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";

import { createTemplate } from "./actions";

/** Panel plegable para crear una plantilla nueva (nombre + tipo de plugin). */
export function CreateTemplate({
  plugins,
}: {
  plugins: { key: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      // En el happy path createTemplate hace redirect (lanza) → no retorna.
      const res = await createTemplate(formData);
      if (res && !res.ok) setError(res.error);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-3.5 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
      >
        <Plus className="h-4 w-4" />
        Crear plantilla
      </button>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Nueva plantilla</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/40 hover:bg-white/5 hover:text-white/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form action={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-white/60">Nombre</span>
          <input
            name="name"
            type="text"
            required
            autoFocus
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/30 outline-none transition focus:border-white/30 focus:bg-white/[0.07]"
            placeholder="Mi rutina"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-white/60">Tipo de entrenamiento</span>
          <select
            name="plugin_key"
            required
            defaultValue={plugins[0]?.key}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none transition focus:border-white/30 [&>option]:bg-[#0a0a0a]"
          >
            {plugins.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-xl bg-white/90 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-60"
        >
          {pending ? "Creando…" : "Crear y editar"}
        </button>
      </form>
    </div>
  );
}
