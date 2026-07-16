import type { ComponentType } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

type TemplateRow = Database["public"]["Tables"]["workout_templates"]["Row"];
type BlockRow = Database["public"]["Tables"]["template_blocks"]["Row"];
type ExerciseRow = Database["public"]["Tables"]["template_exercises"]["Row"];

/**
 * Un set final de una sesión completada, con la info del ejercicio necesaria
 * para que el plugin decida su lógica (is_core, set_number...).
 */
export type CompletedSet = {
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  notes: string;
  is_core: boolean;
};

/** La sesión completada que recibe el plugin. */
export type CompletedSession = {
  id: string;
  user_id: string;
  template_id: string;
  block_id: string;
  performed_on: string;
};

/**
 * Contexto que el shell entrega al plugin cuando una sesión se completa.
 * El plugin lo usa para materializar su lógica de dominio (ciclos, etc.).
 */
export type SessionCompletedContext = {
  supabase: Client;
  session: CompletedSession;
  sets: CompletedSet[];
  /** config del template ya parseada por el propio plugin. */
  config: unknown;
  template: Pick<TemplateRow, "id" | "config" | "plugin_key">;
  blocks: BlockRow[];
  exercises: ExerciseRow[];
};

/**
 * Props que el shell inyecta al Dashboard del plugin en Inicio. El shell ya
 * cargó `data` (serializable) según el tipo que el plugin define; aquí lo
 * dejamos genérico para no acoplar el shell a un plugin concreto.
 */
export type DashboardProps = {
  /** datos ya cargados por el server component de Inicio (serializables). */
  data: unknown;
};

/** Props que el shell inyecta a una ExtraView del plugin. */
export type ExtraViewProps = {
  /** datos ya cargados por el server component de la ruta /v/[slug]. */
  data: unknown;
};

/**
 * Vista extra que un plugin añade a la navegación (aparece en la BottomNav
 * y se sirve en /v/{slug}). `icon` es el nombre de un icono lucide (string
 * serializable, no un componente) para poder pasarlo de server a client.
 */
export type PluginExtraView = {
  slug: string;
  label: string;
  /** nombre de icono lucide-react (p. ej. "Repeat"). */
  icon: string;
  Component: ComponentType<ExtraViewProps>;
};

/** Props que el shell inyecta al widget SessionExtras del plugin. */
export type SessionExtrasProps = {
  /** config ya parseada del template. */
  config: unknown;
  /** ejercicio core del bloque activo (si lo hay). */
  coreExercise: { id: string; name: string } | null;
  /** reps de la serie 1 del core como string de input (puede estar vacío). */
  coreSet1Reps: string;
};

export interface WorkoutPlugin {
  key: string;
  name: string;
  /** Cada plugin refina el tipo de su config. */
  parseConfig(raw: unknown): unknown;
  /** Widgets específicos del plugin en el formulario de sesión. */
  SessionExtras?: ComponentType<SessionExtrasProps>;
  /** Hook al cerrar una sesión (crear/actualizar ciclos, etc.). */
  onSessionCompleted?(ctx: SessionCompletedContext): Promise<void>;

  /** Dashboard del plugin en Inicio (recibe datos ya cargados por el shell). */
  Dashboard: ComponentType<DashboardProps>;

  /** Vistas extra del plugin (BottomNav + ruta /v/{slug}). */
  ExtraViews?: PluginExtraView[];
}
