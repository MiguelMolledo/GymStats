import { Dumbbell } from "lucide-react";
import Link from "next/link";

import { Header } from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { getPlugin } from "@/plugins/registry";
import { loadBilboDashboardData } from "@/plugins/bilbo/data";

import { InProgressBanner } from "./InProgressBanner";

function EmptyState({
  title = "Sin plantilla activa",
  message = "Elige una plantilla para empezar a registrar tu progreso.",
  href = "/plantillas",
  cta = "Ver plantillas",
}: {
  title?: string;
  message?: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
        <Dumbbell className="h-7 w-7 text-white/40" />
      </div>
      <div>
        <p className="text-base font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm text-white/45">{message}</p>
      </div>
      <Link
        href={href}
        className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
      >
        {cta}
      </Link>
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName = "";
  let blocks: { id: string; label: string; emoji: string | null }[] = [];
  let dashboard: React.ReactNode = null;
  let empty: React.ReactNode = <EmptyState />;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, active_template_id")
      .eq("id", user.id)
      .single();
    displayName = profile?.display_name ?? "";

    const templateId = profile?.active_template_id ?? null;
    if (templateId) {
      const { data: template } = await supabase
        .from("workout_templates")
        .select("plugin_key")
        .eq("id", templateId)
        .single();

      const { data: blockRows } = await supabase
        .from("template_blocks")
        .select("id, label, emoji")
        .eq("template_id", templateId)
        .order("position");
      blocks = blockRows ?? [];

      if (blocks.length === 0) {
        // Plantilla activa sin bloques: estado vacío con link al editor.
        empty = (
          <EmptyState
            title="Tu plantilla está vacía"
            message="Añade bloques y ejercicios a tu plantilla para empezar."
            href={`/plantillas/${templateId}`}
            cta="Añade bloques a tu plantilla"
          />
        );
      } else {
        const plugin = template ? getPlugin(template.plugin_key) : null;
        if (plugin && template?.plugin_key === "bilbo") {
          const data = await loadBilboDashboardData(supabase, user.id, templateId);
          if (data) {
            const Dashboard = plugin.Dashboard;
            dashboard = <Dashboard data={data} />;
          }
        }
      }
    }
  }

  return (
    <>
      <Header
        title={displayName ? `Hola, ${displayName}` : "Inicio"}
        subtitle="Tu resumen de entrenamiento"
      />
      <InProgressBanner blocks={blocks} />
      {dashboard ?? empty}
    </>
  );
}
