import { Header } from "@/components/Header";
import { Placeholder } from "@/components/Placeholder";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    displayName = profile?.display_name ?? "";
  }

  return (
    <>
      <Header
        title={displayName ? `Hola, ${displayName}` : "Inicio"}
        subtitle="Tu resumen de entrenamiento"
      />
      <Placeholder />
    </>
  );
}
