import { bilboPlugin } from "./bilbo";
import type { WorkoutPlugin } from "./types";

const PLUGINS: Record<string, WorkoutPlugin> = {
  [bilboPlugin.key]: bilboPlugin,
};

/** Devuelve el plugin registrado para una key, o null si no existe. */
export function getPlugin(pluginKey: string): WorkoutPlugin | null {
  return PLUGINS[pluginKey] ?? null;
}
