import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Header } from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { parseBilboConfig } from "@/plugins/bilbo/config";

import { loadEditorTemplate } from "../data";
import { TemplateEditor } from "./TemplateEditor";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <Header title="Editar plantilla" />
        <div className="px-6 py-24 text-center text-sm text-white/40">
          Inicia sesión para editar plantillas.
        </div>
      </>
    );
  }

  const template = await loadEditorTemplate(supabase, id);
  if (!template) notFound();

  // Solo el dueño edita (RLS es la red de seguridad; esto es el check UX).
  if (template.created_by !== user.id) {
    return (
      <>
        <Header title="Editar plantilla" subtitle={template.name} />
        <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
          <p className="text-sm text-white/60">
            Esta plantilla no es tuya, no puedes editarla.
          </p>
          <p className="text-xs text-white/40">
            Duplícala desde la lista para tener tu propia copia editable.
          </p>
          <Link
            href="/plantillas"
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a plantillas
          </Link>
        </div>
      </>
    );
  }

  const bilboConfig =
    template.plugin_key === "bilbo" ? parseBilboConfig(template.config) : null;

  return (
    <>
      <Header title="Editar plantilla" subtitle={template.name} />
      <div className="px-5 pt-3">
        <Link
          href="/plantillas"
          className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
        >
          <ArrowLeft className="h-4 w-4" />
          Plantillas
        </Link>
      </div>
      <TemplateEditor template={template} bilboConfig={bilboConfig} />
    </>
  );
}
