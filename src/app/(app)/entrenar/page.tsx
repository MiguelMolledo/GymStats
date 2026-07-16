import { Header } from "@/components/Header";
import { createClient } from "@/lib/supabase/server";

import { EntrenarClient, type EntrenarData } from "./EntrenarClient";
import { EmptyTemplate, NoTemplate } from "./NoTemplate";

export default async function EntrenarPage({
  searchParams,
}: {
  searchParams: Promise<{ bloque?: string }>;
}) {
  const { bloque } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <Header title="Entrenar" subtitle="Empieza una sesión" />
        <NoTemplate />
      </>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_template_id")
    .eq("id", user.id)
    .single();

  const templateId = profile?.active_template_id;
  if (!templateId) {
    return (
      <>
        <Header title="Entrenar" subtitle="Empieza una sesión" />
        <NoTemplate />
      </>
    );
  }

  // Template + bloques + ejercicios no archivados, ordenados.
  const [{ data: template }, { data: blocks }, { data: exercises }] =
    await Promise.all([
      supabase
        .from("workout_templates")
        .select("id, name, plugin_key, config")
        .eq("id", templateId)
        .single(),
      supabase
        .from("template_blocks")
        .select("id, slug, label, emoji, accent_color, position, template_id")
        .eq("template_id", templateId)
        .order("position"),
      supabase
        .from("template_exercises")
        .select("id, block_id, name, target_sets, is_core, position, archived"),
    ]);

  if (!template || !blocks || !exercises) {
    return (
      <>
        <Header title="Entrenar" subtitle="Empieza una sesión" />
        <NoTemplate />
      </>
    );
  }

  if (blocks.length === 0) {
    return (
      <>
        <Header title="Entrenar" subtitle="Empieza una sesión" />
        <EmptyTemplate templateId={templateId} />
      </>
    );
  }

  const activeExercises = exercises
    .filter((e) => !e.archived)
    .sort((a, b) => a.position - b.position);

  // Prefill: por cada bloque, la última sesión completada del usuario y sus sets.
  const blockIds = blocks.map((b) => b.id);
  const { data: lastSessions } = await supabase
    .from("workout_sessions")
    .select("id, block_id, performed_on, completed_at")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .in("block_id", blockIds)
    .order("performed_on", { ascending: false })
    .order("completed_at", { ascending: false });

  // Primera (más reciente) sesión completada por bloque.
  const lastByBlock = new Map<string, string>();
  for (const s of lastSessions ?? []) {
    if (!lastByBlock.has(s.block_id)) lastByBlock.set(s.block_id, s.id);
  }
  const lastSessionIds = [...lastByBlock.values()];

  const prefillByBlock: EntrenarData["prefillByBlock"] = {};
  if (lastSessionIds.length > 0) {
    const { data: prevSets } = await supabase
      .from("session_sets")
      .select("session_id, exercise_id, set_number, weight")
      .in("session_id", lastSessionIds);
    const sessionToBlock = new Map<string, string>();
    for (const [blockId, sessionId] of lastByBlock) {
      sessionToBlock.set(sessionId, blockId);
    }
    for (const set of prevSets ?? []) {
      const blockId = sessionToBlock.get(set.session_id);
      if (!blockId) continue;
      (prefillByBlock[blockId] ??= []).push({
        exercise_id: set.exercise_id,
        set_number: set.set_number,
        weight: set.weight,
      });
    }
  }

  const data: EntrenarData = {
    userId: user.id,
    template: {
      id: template.id,
      name: template.name,
      plugin_key: template.plugin_key,
      config: template.config,
    },
    blocks: blocks.map((b) => ({
      id: b.id,
      slug: b.slug,
      label: b.label,
      emoji: b.emoji,
      accent_color: b.accent_color,
      position: b.position,
    })),
    exercises: activeExercises.map((e) => ({
      id: e.id,
      block_id: e.block_id,
      name: e.name,
      target_sets: e.target_sets,
      is_core: e.is_core,
      position: e.position,
    })),
    prefillByBlock,
  };

  return (
    <>
      <Header title="Entrenar" subtitle="Empieza una sesión" />
      <EntrenarClient data={data} preselectSlug={bloque ?? null} />
    </>
  );
}
