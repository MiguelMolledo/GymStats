import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { getPlugin } from "@/plugins/registry";

type Client = SupabaseClient<Database, "gymstats">;

/** Plantilla resumida para la lista de /plantillas. */
export type TemplateSummary = {
  id: string;
  name: string;
  plugin_key: string;
  pluginName: string;
  created_by: string | null;
  ownerName: string | null;
  isOwn: boolean;
  isSystem: boolean;
  isActive: boolean;
  blockCount: number;
  exerciseCount: number;
};

/**
 * Carga todas las plantillas visibles para el usuario (RLS: todas), con su
 * resumen de bloques/ejercicios (no archivados), el nombre del dueño y qué
 * plantilla es la activa del propio usuario.
 */
export async function loadTemplates(
  supabase: Client,
  userId: string,
  activeTemplateId: string | null,
): Promise<TemplateSummary[]> {
  const { data: templates } = await supabase
    .from("workout_templates")
    .select("id, name, plugin_key, created_by, created_at")
    .order("created_at", { ascending: true });

  if (!templates || templates.length === 0) return [];

  const templateIds = templates.map((t) => t.id);

  const [{ data: blocks }, { data: profiles }] = await Promise.all([
    supabase
      .from("template_blocks")
      .select("id, template_id")
      .in("template_id", templateIds),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const blockList = blocks ?? [];
  const blockIds = blockList.map((b) => b.id);

  // Ejercicios no archivados por bloque (para contar).
  let exercises: { id: string; block_id: string }[] = [];
  if (blockIds.length > 0) {
    const { data: exRows } = await supabase
      .from("template_exercises")
      .select("id, block_id")
      .eq("archived", false)
      .in("block_id", blockIds);
    exercises = exRows ?? [];
  }

  const blockCountByTemplate = new Map<string, number>();
  const blockToTemplate = new Map<string, string>();
  for (const b of blockList) {
    blockCountByTemplate.set(
      b.template_id,
      (blockCountByTemplate.get(b.template_id) ?? 0) + 1,
    );
    blockToTemplate.set(b.id, b.template_id);
  }

  const exCountByTemplate = new Map<string, number>();
  for (const e of exercises) {
    const tid = blockToTemplate.get(e.block_id);
    if (!tid) continue;
    exCountByTemplate.set(tid, (exCountByTemplate.get(tid) ?? 0) + 1);
  }

  const nameById = new Map<string, string>();
  for (const p of profiles ?? []) nameById.set(p.id, p.display_name);

  return templates.map((t) => {
    const isSystem = t.created_by === null;
    const isOwn = t.created_by === userId;
    return {
      id: t.id,
      name: t.name,
      plugin_key: t.plugin_key,
      pluginName: getPlugin(t.plugin_key)?.name ?? t.plugin_key,
      created_by: t.created_by,
      ownerName: isSystem || isOwn ? null : (nameById.get(t.created_by!) ?? null),
      isOwn,
      isSystem,
      isActive: t.id === activeTemplateId,
      blockCount: blockCountByTemplate.get(t.id) ?? 0,
      exerciseCount: exCountByTemplate.get(t.id) ?? 0,
    };
  });
}

/** Plantilla completa (con bloques y ejercicios) para el editor. */
export type EditorBlock = {
  id: string;
  slug: string;
  label: string;
  emoji: string | null;
  accent_color: string | null;
  position: number;
  exercises: EditorExercise[];
};

export type EditorExercise = {
  id: string;
  name: string;
  target_sets: number;
  is_core: boolean;
  position: number;
  archived: boolean;
};

export type EditorTemplate = {
  id: string;
  name: string;
  plugin_key: string;
  pluginName: string;
  config: Database["gymstats"]["Tables"]["workout_templates"]["Row"]["config"];
  created_by: string | null;
  blocks: EditorBlock[];
};

/**
 * Carga la plantilla completa para el editor. Devuelve null si no existe.
 * Incluye ejercicios archivados (marcados) para poder listarlos aparte.
 */
export async function loadEditorTemplate(
  supabase: Client,
  templateId: string,
): Promise<EditorTemplate | null> {
  const { data: template } = await supabase
    .from("workout_templates")
    .select("id, name, plugin_key, config, created_by")
    .eq("id", templateId)
    .maybeSingle();
  if (!template) return null;

  const { data: blocks } = await supabase
    .from("template_blocks")
    .select("id, slug, label, emoji, accent_color, position")
    .eq("template_id", templateId)
    .order("position");

  const blockIds = (blocks ?? []).map((b) => b.id);
  const exByBlock = new Map<string, EditorExercise[]>();
  if (blockIds.length > 0) {
    const { data: exRows } = await supabase
      .from("template_exercises")
      .select("id, block_id, name, target_sets, is_core, position, archived")
      .in("block_id", blockIds)
      .order("position");
    for (const e of exRows ?? []) {
      (exByBlock.get(e.block_id) ?? exByBlock.set(e.block_id, []).get(e.block_id)!).push(
        {
          id: e.id,
          name: e.name,
          target_sets: e.target_sets,
          is_core: e.is_core,
          position: e.position,
          archived: e.archived,
        },
      );
    }
  }

  return {
    id: template.id,
    name: template.name,
    plugin_key: template.plugin_key,
    pluginName: getPlugin(template.plugin_key)?.name ?? template.plugin_key,
    config: template.config,
    created_by: template.created_by,
    blocks: (blocks ?? []).map((b) => ({
      id: b.id,
      slug: b.slug,
      label: b.label,
      emoji: b.emoji,
      accent_color: b.accent_color,
      position: b.position,
      exercises: exByBlock.get(b.id) ?? [],
    })),
  };
}
