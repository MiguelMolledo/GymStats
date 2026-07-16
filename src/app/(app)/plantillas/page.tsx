import { LayoutTemplate } from "lucide-react";

import { Header } from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { listPlugins } from "@/plugins/registry";

import { CreateTemplate } from "./CreateTemplate";
import { TemplateCard } from "./TemplateCard";
import { loadTemplates } from "./data";

export default async function PlantillasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <Header title="Plantillas" subtitle="Tus rutinas de entrenamiento" />
        <div className="px-6 py-24 text-center text-sm text-white/40">
          Inicia sesión para ver tus plantillas.
        </div>
      </>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_template_id")
    .eq("id", user.id)
    .single();

  const templates = await loadTemplates(
    supabase,
    user.id,
    profile?.active_template_id ?? null,
  );

  const plugins = listPlugins();

  return (
    <>
      <Header title="Plantillas" subtitle="Tus rutinas de entrenamiento" />

      <div className="space-y-4 px-5 pt-4">
        <CreateTemplate plugins={plugins} />

        {templates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
              <LayoutTemplate className="h-6 w-6 text-white/40" />
            </div>
            <p className="text-sm text-white/40">Aún no hay plantillas.</p>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {templates.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
