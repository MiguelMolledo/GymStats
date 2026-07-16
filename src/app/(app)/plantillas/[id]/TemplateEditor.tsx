"use client";

import { useState, useTransition } from "react";
import { Plus, Save } from "lucide-react";

import type { BilboConfig } from "@/plugins/bilbo/config";

import { addBlock, updateTemplate } from "../actions";
import type { EditorTemplate } from "../data";
import { BlockEditor } from "./BlockEditor";
import { AccentPicker } from "./AccentPicker";
import { DEFAULT_ACCENT } from "../logic";

export function TemplateEditor({
  template,
  bilboConfig,
}: {
  template: EditorTemplate;
  bilboConfig: BilboConfig | null;
}) {
  return (
    <div className="space-y-5 px-5 pb-4 pt-4">
      <TemplateMeta template={template} bilboConfig={bilboConfig} />

      <div>
        <div className="mb-3 flex items-center gap-2 px-1 text-white/50">
          <p className="text-xs font-medium uppercase tracking-wide">Bloques</p>
        </div>

        {template.blocks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/40">
            Aún no hay bloques. Añade el primero para empezar.
          </p>
        ) : (
          <div className="space-y-4">
            {template.blocks.map((block, i) => (
              <BlockEditor
                key={block.id}
                templateId={template.id}
                block={block}
                isFirst={i === 0}
                isLast={i === template.blocks.length - 1}
              />
            ))}
          </div>
        )}

        <AddBlock templateId={template.id} />
      </div>
    </div>
  );
}

function TemplateMeta({
  template,
  bilboConfig,
}: {
  template: EditorTemplate;
  bilboConfig: BilboConfig | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateTemplate(template.id, formData);
      if (!res.ok) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <form
      action={handleSubmit}
      className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"
    >
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-white/50">
        {template.pluginName}
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-white/60">Nombre</span>
        <input
          name="name"
          type="text"
          required
          defaultValue={template.name}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none transition focus:border-white/30 focus:bg-white/[0.07]"
        />
      </label>

      {bilboConfig && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/60">Reps objetivo</span>
            <input
              name="target_reps"
              type="number"
              inputMode="numeric"
              min={1}
              required
              defaultValue={bilboConfig.target_reps}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none transition focus:border-white/30 focus:bg-white/[0.07]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-white/60">Reps mínimas</span>
            <input
              name="floor_reps"
              type="number"
              inputMode="numeric"
              min={1}
              required
              defaultValue={bilboConfig.floor_reps}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none transition focus:border-white/30 focus:bg-white/[0.07]"
            />
          </label>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-60"
      >
        <Save className="h-4 w-4" />
        {pending ? "Guardando…" : saved ? "Guardado" : "Guardar"}
      </button>
    </form>
  );
}

function AddBlock({ templateId }: { templateId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accent, setAccent] = useState<string>(DEFAULT_ACCENT);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("accent_color", accent);
    startTransition(async () => {
      const res = await addBlock(templateId, formData);
      if (!res.ok) setError(res.error);
      else setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-3 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
      >
        <Plus className="h-4 w-4" />
        Añadir bloque
      </button>
    );
  }

  return (
    <form
      action={handleSubmit}
      className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5"
    >
      <p className="mb-3 text-sm font-semibold text-white">Nuevo bloque</p>
      <div className="flex gap-3">
        <label className="flex w-20 flex-col gap-1.5">
          <span className="text-xs text-white/60">Emoji</span>
          <input
            name="emoji"
            type="text"
            maxLength={4}
            placeholder="🏋️"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-white outline-none transition focus:border-white/30"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-xs text-white/60">Nombre</span>
          <input
            name="label"
            type="text"
            required
            autoFocus
            placeholder="Pecho y tríceps"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none transition focus:border-white/30"
          />
        </label>
      </div>

      <div className="mt-3">
        <span className="mb-1.5 block text-xs text-white/60">Color</span>
        <AccentPicker value={accent} onChange={setAccent} />
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-60"
        >
          {pending ? "Añadiendo…" : "Añadir"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
