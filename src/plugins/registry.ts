import { BILBO_DEFAULTS } from "./bilbo/config";
import { bilboPlugin } from "./bilbo";
import type { WorkoutPlugin } from "./types";

const PLUGINS: Record<string, WorkoutPlugin> = {
  [bilboPlugin.key]: bilboPlugin,
};

/** Config por defecto (jsonb) al crear una plantilla nueva de cada plugin. */
const DEFAULT_CONFIG: Record<string, Record<string, unknown>> = {
  [bilboPlugin.key]: { ...BILBO_DEFAULTS },
};

/** Devuelve el plugin registrado para una key, o null si no existe. */
export function getPlugin(pluginKey: string): WorkoutPlugin | null {
  return PLUGINS[pluginKey] ?? null;
}

/** Lista de plugins disponibles (para el selector al crear plantillas). */
export function listPlugins(): { key: string; name: string }[] {
  return Object.values(PLUGINS).map((p) => ({ key: p.key, name: p.name }));
}

/** Config por defecto para una plantilla nueva del plugin dado. */
export function defaultConfigFor(pluginKey: string): Record<string, unknown> {
  return { ...(DEFAULT_CONFIG[pluginKey] ?? {}) };
}
