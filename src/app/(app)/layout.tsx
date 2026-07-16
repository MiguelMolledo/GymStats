import { GlowBackground } from "@/components/GlowBackground";
import { BottomNav, type NavExtraView } from "@/components/BottomNav";
import { createClient } from "@/lib/supabase/server";
import { getPlugin } from "@/plugins/registry";

/** Resuelve las ExtraViews del plugin de la plantilla activa del usuario. */
async function loadExtraViews(): Promise<NavExtraView[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_template_id")
    .eq("id", user.id)
    .single();
  if (!profile?.active_template_id) return [];

  const { data: template } = await supabase
    .from("workout_templates")
    .select("plugin_key")
    .eq("id", profile.active_template_id)
    .single();
  if (!template) return [];

  const plugin = getPlugin(template.plugin_key);
  return (plugin?.ExtraViews ?? []).map((v) => ({
    slug: v.slug,
    label: v.label,
    icon: v.icon,
  }));
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const extraViews = await loadExtraViews();

  return (
    <>
      <GlowBackground />
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
        <div className="flex-1 pb-28">{children}</div>
      </div>
      <BottomNav extraViews={extraViews} />
    </>
  );
}
