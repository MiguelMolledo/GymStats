import { Header } from "@/components/Header";
import { Placeholder } from "@/components/Placeholder";
import { createClient } from "@/lib/supabase/server";

import { InProgressBanner } from "./InProgressBanner";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName = "";
  let blocks: { id: string; label: string; emoji: string | null }[] = [];
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, active_template_id")
      .eq("id", user.id)
      .single();
    displayName = profile?.display_name ?? "";

    if (profile?.active_template_id) {
      const { data: blockRows } = await supabase
        .from("template_blocks")
        .select("id, label, emoji")
        .eq("template_id", profile.active_template_id)
        .order("position");
      blocks = blockRows ?? [];
    }
  }

  return (
    <>
      <Header
        title={displayName ? `Hola, ${displayName}` : "Inicio"}
        subtitle="Tu resumen de entrenamiento"
      />
      <InProgressBanner blocks={blocks} />
      <Placeholder />
    </>
  );
}
