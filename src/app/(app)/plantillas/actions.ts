"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { defaultConfigFor, getPlugin } from "@/plugins/registry";

import { DEFAULT_ACCENT, slugify, uniqueSlug, validateBilboConfig } from "./logic";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Revalida las rutas del shell que dependen de la plantilla activa. */
function revalidateShell() {
  revalidatePath("/", "layout");
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Comprueba que el template existe y es del usuario. Devuelve created_by. */
async function assertOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  templateId: string,
  userId: string,
): Promise<ActionResult> {
  const { data } = await supabase
    .from("workout_templates")
    .select("created_by")
    .eq("id", templateId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Plantilla no encontrada." };
  if (data.created_by !== userId) {
    return { ok: false, error: "No puedes editar esta plantilla." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Nivel plantilla
// ---------------------------------------------------------------------------

/** Activa una plantilla como la del usuario (profiles.active_template_id). */
export async function useTemplate(templateId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const { error } = await supabase
    .from("profiles")
    .update({ active_template_id: templateId })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidateShell();
  return { ok: true };
}

/**
 * Crea una plantilla vacía del plugin dado y navega a su editor.
 * (Lanza redirect → no retorna en el happy path.)
 */
export async function createTemplate(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const name = String(formData.get("name") ?? "").trim();
  const pluginKey = String(formData.get("plugin_key") ?? "").trim();
  if (!name) return { ok: false, error: "Ponle un nombre a la plantilla." };
  if (!getPlugin(pluginKey)) return { ok: false, error: "Tipo de entrenamiento no válido." };

  const { data, error } = await supabase
    .from("workout_templates")
    .insert({
      name,
      plugin_key: pluginKey,
      config: defaultConfigFor(pluginKey) as Json,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo crear la plantilla." };
  }

  revalidateShell();
  redirect(`/plantillas/${data.id}`);
}

/** Duplica una plantilla (con bloques y ejercicios no archivados) como propia. */
export async function duplicateTemplate(templateId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const { data: source } = await supabase
    .from("workout_templates")
    .select("name, plugin_key, config")
    .eq("id", templateId)
    .maybeSingle();
  if (!source) return { ok: false, error: "Plantilla no encontrada." };

  const { data: newTemplate, error: tErr } = await supabase
    .from("workout_templates")
    .insert({
      name: `${source.name} (copia)`,
      plugin_key: source.plugin_key,
      config: source.config,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (tErr || !newTemplate) {
    return { ok: false, error: tErr?.message ?? "No se pudo duplicar." };
  }

  const { data: blocks } = await supabase
    .from("template_blocks")
    .select("id, slug, label, emoji, accent_color, position")
    .eq("template_id", templateId)
    .order("position");

  for (const b of blocks ?? []) {
    const { data: newBlock, error: bErr } = await supabase
      .from("template_blocks")
      .insert({
        template_id: newTemplate.id,
        slug: b.slug,
        label: b.label,
        emoji: b.emoji,
        accent_color: b.accent_color,
        position: b.position,
      })
      .select("id")
      .single();
    if (bErr || !newBlock) continue;

    const { data: exercises } = await supabase
      .from("template_exercises")
      .select("name, target_sets, is_core, position")
      .eq("block_id", b.id)
      .eq("archived", false)
      .order("position");

    if (exercises && exercises.length > 0) {
      await supabase.from("template_exercises").insert(
        exercises.map((e) => ({
          block_id: newBlock.id,
          name: e.name,
          target_sets: e.target_sets,
          is_core: e.is_core,
          position: e.position,
        })),
      );
    }
  }

  revalidateShell();
  return { ok: true };
}

/** Elimina una plantilla propia. Falla claro si tiene sesiones (FK). */
export async function deleteTemplate(templateId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const owner = await assertOwner(supabase, templateId, user.id);
  if (!owner.ok) return owner;

  const { error } = await supabase
    .from("workout_templates")
    .delete()
    .eq("id", templateId);
  if (error) {
    if (isForeignKeyViolation(error)) {
      return {
        ok: false,
        error:
          "Esta plantilla tiene entrenamientos registrados; no se puede eliminar.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidateShell();
  return { ok: true };
}

/** Actualiza nombre y config (validada) de una plantilla propia. */
export async function updateTemplate(
  templateId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const owner = await assertOwner(supabase, templateId, user.id);
  if (!owner.ok) return owner;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "El nombre no puede estar vacío." };

  const { data: template } = await supabase
    .from("workout_templates")
    .select("plugin_key")
    .eq("id", templateId)
    .single();

  let config: Record<string, unknown> | undefined;
  if (template?.plugin_key === "bilbo") {
    const v = validateBilboConfig(
      formData.get("target_reps"),
      formData.get("floor_reps"),
    );
    if (!v.ok) return { ok: false, error: v.error };
    config = { target_reps: v.value.target_reps, floor_reps: v.value.floor_reps };
  }

  const { error } = await supabase
    .from("workout_templates")
    .update(config ? { name, config: config as Json } : { name })
    .eq("id", templateId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/plantillas/${templateId}`);
  revalidateShell();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Nivel bloque
// ---------------------------------------------------------------------------

export async function addBlock(
  templateId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const owner = await assertOwner(supabase, templateId, user.id);
  if (!owner.ok) return owner;

  const label = String(formData.get("label") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim() || null;
  const accent = String(formData.get("accent_color") ?? "").trim() || DEFAULT_ACCENT;
  if (!label) return { ok: false, error: "El bloque necesita un nombre." };

  const { data: existing } = await supabase
    .from("template_blocks")
    .select("slug, position")
    .eq("template_id", templateId);

  const slug = uniqueSlug(label, (existing ?? []).map((b) => b.slug));
  const nextPos =
    (existing ?? []).reduce((max, b) => Math.max(max, b.position), -1) + 1;

  const { error } = await supabase.from("template_blocks").insert({
    template_id: templateId,
    slug,
    label,
    emoji,
    accent_color: accent,
    position: nextPos,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/plantillas/${templateId}`);
  return { ok: true };
}

export async function updateBlock(
  blockId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const templateId = await blockTemplateId(supabase, blockId);
  if (!templateId) return { ok: false, error: "Bloque no encontrado." };
  const owner = await assertOwner(supabase, templateId, user.id);
  if (!owner.ok) return owner;

  const label = String(formData.get("label") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim() || null;
  const accent = String(formData.get("accent_color") ?? "").trim() || DEFAULT_ACCENT;
  if (!label) return { ok: false, error: "El bloque necesita un nombre." };

  const { error } = await supabase
    .from("template_blocks")
    .update({ label, emoji, accent_color: accent })
    .eq("id", blockId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/plantillas/${templateId}`);
  return { ok: true };
}

export async function deleteBlock(blockId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const templateId = await blockTemplateId(supabase, blockId);
  if (!templateId) return { ok: false, error: "Bloque no encontrado." };
  const owner = await assertOwner(supabase, templateId, user.id);
  if (!owner.ok) return owner;

  const { error } = await supabase.from("template_blocks").delete().eq("id", blockId);
  if (error) {
    if (isForeignKeyViolation(error)) {
      return {
        ok: false,
        error:
          "Este bloque tiene entrenamientos registrados; no se puede eliminar.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/plantillas/${templateId}`);
  return { ok: true };
}

/** Reordena un bloque una posición arriba/abajo (swap de position). */
export async function moveBlock(
  blockId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const { data: block } = await supabase
    .from("template_blocks")
    .select("id, template_id, position")
    .eq("id", blockId)
    .maybeSingle();
  if (!block) return { ok: false, error: "Bloque no encontrado." };
  const owner = await assertOwner(supabase, block.template_id, user.id);
  if (!owner.ok) return owner;

  const { data: siblings } = await supabase
    .from("template_blocks")
    .select("id, position")
    .eq("template_id", block.template_id)
    .order("position");

  const neighbor = pickNeighbor(siblings ?? [], block.id, direction);
  if (!neighbor) return { ok: true }; // ya está en el extremo

  await swapPositions(
    supabase,
    "template_blocks",
    block.id,
    block.position,
    neighbor.id,
    neighbor.position,
  );

  revalidatePath(`/plantillas/${block.template_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Nivel ejercicio
// ---------------------------------------------------------------------------

export async function addExercise(
  blockId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const templateId = await blockTemplateId(supabase, blockId);
  if (!templateId) return { ok: false, error: "Bloque no encontrado." };
  const owner = await assertOwner(supabase, templateId, user.id);
  if (!owner.ok) return owner;

  const name = String(formData.get("name") ?? "").trim();
  const targetSets = Math.max(1, Math.round(Number(formData.get("target_sets")) || 1));
  const isCore = formData.get("is_core") === "on" || formData.get("is_core") === "true";
  if (!name) return { ok: false, error: "El ejercicio necesita un nombre." };

  const { data: existing } = await supabase
    .from("template_exercises")
    .select("position, archived")
    .eq("block_id", blockId);
  const nextPos =
    (existing ?? []).reduce((max, e) => Math.max(max, e.position), -1) + 1;

  // Si va a ser core, desmarca cualquier core previo ANTES (índice único parcial).
  if (isCore) {
    const unset = await unsetCore(supabase, blockId);
    if (!unset.ok) return unset;
  }

  const { error } = await supabase.from("template_exercises").insert({
    block_id: blockId,
    name,
    target_sets: targetSets,
    is_core: isCore,
    position: nextPos,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/plantillas/${templateId}`);
  return { ok: true };
}

export async function updateExercise(
  exerciseId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const ctx = await exerciseContext(supabase, exerciseId);
  if (!ctx) return { ok: false, error: "Ejercicio no encontrado." };
  const owner = await assertOwner(supabase, ctx.templateId, user.id);
  if (!owner.ok) return owner;

  const name = String(formData.get("name") ?? "").trim();
  const targetSets = Math.max(1, Math.round(Number(formData.get("target_sets")) || 1));
  if (!name) return { ok: false, error: "El ejercicio necesita un nombre." };

  const { error } = await supabase
    .from("template_exercises")
    .update({ name, target_sets: targetSets })
    .eq("id", exerciseId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/plantillas/${ctx.templateId}`);
  return { ok: true };
}

/**
 * Marca este ejercicio como core, desmarcando cualquier otro core del bloque
 * ANTES (índice único parcial: un solo core no-archivado por bloque).
 */
export async function setCore(exerciseId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const ctx = await exerciseContext(supabase, exerciseId);
  if (!ctx) return { ok: false, error: "Ejercicio no encontrado." };
  const owner = await assertOwner(supabase, ctx.templateId, user.id);
  if (!owner.ok) return owner;

  const unset = await unsetCore(supabase, ctx.blockId, exerciseId);
  if (!unset.ok) return unset;

  const { error } = await supabase
    .from("template_exercises")
    .update({ is_core: true })
    .eq("id", exerciseId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/plantillas/${ctx.templateId}`);
  return { ok: true };
}

/** Desmarca este ejercicio como core. */
export async function unsetCoreExercise(exerciseId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const ctx = await exerciseContext(supabase, exerciseId);
  if (!ctx) return { ok: false, error: "Ejercicio no encontrado." };
  const owner = await assertOwner(supabase, ctx.templateId, user.id);
  if (!owner.ok) return owner;

  const { error } = await supabase
    .from("template_exercises")
    .update({ is_core: false })
    .eq("id", exerciseId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/plantillas/${ctx.templateId}`);
  return { ok: true };
}

export async function moveExercise(
  exerciseId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const ctx = await exerciseContext(supabase, exerciseId);
  if (!ctx) return { ok: false, error: "Ejercicio no encontrado." };
  const owner = await assertOwner(supabase, ctx.templateId, user.id);
  if (!owner.ok) return owner;

  // Solo entre no archivados del mismo bloque, en orden de position.
  const { data: siblings } = await supabase
    .from("template_exercises")
    .select("id, position")
    .eq("block_id", ctx.blockId)
    .eq("archived", false)
    .order("position");

  const current = (siblings ?? []).find((e) => e.id === exerciseId);
  if (!current) return { ok: true };
  const neighbor = pickNeighbor(siblings ?? [], exerciseId, direction);
  if (!neighbor) return { ok: true };

  await swapPositions(
    supabase,
    "template_exercises",
    current.id,
    current.position,
    neighbor.id,
    neighbor.position,
  );

  revalidatePath(`/plantillas/${ctx.templateId}`);
  return { ok: true };
}

/**
 * Elimina un ejercicio. Si tiene session_sets registrados → archived=true
 * (aviso: se archiva). Si no tiene registros → delete real.
 */
export async function deleteExercise(exerciseId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const ctx = await exerciseContext(supabase, exerciseId);
  if (!ctx) return { ok: false, error: "Ejercicio no encontrado." };
  const owner = await assertOwner(supabase, ctx.templateId, user.id);
  if (!owner.ok) return owner;

  const { count } = await supabase
    .from("session_sets")
    .select("id", { count: "exact", head: true })
    .eq("exercise_id", exerciseId);

  if ((count ?? 0) > 0) {
    // Archivar (no borrar): preserva el histórico. Desmarca core al archivar.
    const { error } = await supabase
      .from("template_exercises")
      .update({ archived: true, is_core: false })
      .eq("id", exerciseId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/plantillas/${ctx.templateId}`);
    return {
      ok: false,
      error: "Este ejercicio tiene registros: se ha archivado en vez de borrarse.",
    };
  }

  const { error } = await supabase
    .from("template_exercises")
    .delete()
    .eq("id", exerciseId);
  if (error) {
    if (isForeignKeyViolation(error)) {
      // Red de seguridad: algún ciclo lo referencia → archivar.
      await supabase
        .from("template_exercises")
        .update({ archived: true, is_core: false })
        .eq("id", exerciseId);
      revalidatePath(`/plantillas/${ctx.templateId}`);
      return {
        ok: false,
        error: "Este ejercicio tiene registros: se ha archivado en vez de borrarse.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/plantillas/${ctx.templateId}`);
  return { ok: true };
}

/** Restaura un ejercicio archivado (opcional). */
export async function restoreExercise(exerciseId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const ctx = await exerciseContext(supabase, exerciseId);
  if (!ctx) return { ok: false, error: "Ejercicio no encontrado." };
  const owner = await assertOwner(supabase, ctx.templateId, user.id);
  if (!owner.ok) return owner;

  const { error } = await supabase
    .from("template_exercises")
    .update({ archived: false })
    .eq("id", exerciseId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/plantillas/${ctx.templateId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Client = Awaited<ReturnType<typeof createClient>>;

function isForeignKeyViolation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23503" ||
    (error.message ?? "").toLowerCase().includes("foreign key")
  );
}

async function blockTemplateId(
  supabase: Client,
  blockId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("template_blocks")
    .select("template_id")
    .eq("id", blockId)
    .maybeSingle();
  return data?.template_id ?? null;
}

async function exerciseContext(
  supabase: Client,
  exerciseId: string,
): Promise<{ blockId: string; templateId: string } | null> {
  const { data: ex } = await supabase
    .from("template_exercises")
    .select("block_id")
    .eq("id", exerciseId)
    .maybeSingle();
  if (!ex) return null;
  const templateId = await blockTemplateId(supabase, ex.block_id);
  if (!templateId) return null;
  return { blockId: ex.block_id, templateId };
}

/** Desmarca todos los cores no-archivados del bloque (opcionalmente excluye uno). */
async function unsetCore(
  supabase: Client,
  blockId: string,
  exceptId?: string,
): Promise<ActionResult> {
  let query = supabase
    .from("template_exercises")
    .update({ is_core: false })
    .eq("block_id", blockId)
    .eq("is_core", true)
    .eq("archived", false);
  if (exceptId) query = query.neq("id", exceptId);
  const { error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function pickNeighbor<T extends { id: string; position: number }>(
  ordered: T[],
  id: string,
  direction: "up" | "down",
): T | null {
  const idx = ordered.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= ordered.length) return null;
  return ordered[target];
}

/**
 * Intercambia las positions de dos filas evitando colisión con el índice único
 * (template_id, slug) no aplica aquí, pero position no es única; aun así usamos
 * un paso intermedio negativo por robustez ante futuros índices.
 */
async function swapPositions(
  supabase: Client,
  table: "template_blocks" | "template_exercises",
  idA: string,
  posA: number,
  idB: string,
  posB: number,
): Promise<void> {
  await supabase.from(table).update({ position: -1 }).eq("id", idA);
  await supabase.from(table).update({ position: posA }).eq("id", idB);
  await supabase.from(table).update({ position: posB }).eq("id", idA);
}
