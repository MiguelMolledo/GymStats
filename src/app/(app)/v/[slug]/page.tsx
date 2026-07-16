import { notFound, redirect } from "next/navigation";

import { Header } from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { getPlugin } from "@/plugins/registry";
import { loadBilboCyclesData } from "@/plugins/bilbo/data";

/**
 * Ruta genérica para las ExtraViews de un plugin: resuelve la plantilla activa
 * del usuario → plugin → ExtraView por slug. 404 si el plugin no expone ese
 * slug. La carga de datos es específica del plugin (aquí, BILBO/ciclos).
 */
export default async function ExtraViewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_template_id")
    .eq("id", user.id)
    .single();

  const templateId = profile?.active_template_id ?? null;
  if (!templateId) notFound();

  const { data: template } = await supabase
    .from("workout_templates")
    .select("plugin_key")
    .eq("id", templateId)
    .single();
  if (!template) notFound();

  const plugin = getPlugin(template.plugin_key);
  const view = plugin?.ExtraViews?.find((v) => v.slug === slug);
  if (!plugin || !view) notFound();

  // Carga de datos específica del plugin.
  let data: unknown = null;
  if (template.plugin_key === "bilbo" && slug === "ciclos") {
    data = await loadBilboCyclesData(supabase, user.id, templateId);
  }
  if (data == null) notFound();

  const Component = view.Component;
  return (
    <>
      <Header title={view.label} subtitle="Historial de ciclos" />
      <Component data={data} />
    </>
  );
}
