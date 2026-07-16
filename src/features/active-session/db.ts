import Dexie, { type EntityTable } from "dexie";

import type { LocalSet } from "./logic";

/**
 * Sesión local. Solo puede haber una `active` a la vez, pero pueden quedar
 * sesiones `completed`/`discarded` pendientes de volcar a Supabase (offline).
 */
export type LocalSession = {
  id: string;
  user_id: string;
  template_id: string;
  block_id: string;
  /** plugin del template, para ejecutar el hook de cierre sin refetch previo. */
  plugin_key: string;
  performed_on: string; // YYYY-MM-DD
  notes: string;
  started_at: string; // ISO
  completed_at: string | null; // ISO
  status: "active" | "completed" | "discarded";
  /** 1 si la fila de sesión tiene cambios sin sincronizar. */
  dirty: 0 | 1;
  /** 1 si la sesión existe en Supabase (insertada). */
  syncedInsert: 0 | 1;
  /**
   * Pendiente de ejecutar plugin.onSessionCompleted tras completarla.
   * 1 = pendiente. Se limpia cuando el hook corre con éxito.
   */
  pendingCompletedHook: 0 | 1;
};

export type { LocalSet };

class ActiveSessionDB extends Dexie {
  localSessions!: EntityTable<LocalSession, "id">;
  localSets!: EntityTable<LocalSet, "id">;

  constructor() {
    super("gymstats-active-session");
    this.version(1).stores({
      // Solo una sesión activa; indexamos por status para consultarla.
      localSessions: "id, status, user_id",
      // dirty para recoger los pendientes; [session_id+exercise_id+set_number]
      // no es necesario porque el id ya es único y determinista.
      localSets: "id, session_id, dirty",
    });
  }
}

// Instancia perezosa: Dexie solo existe en el navegador (indexedDB).
let _db: ActiveSessionDB | null = null;

export function getDB(): ActiveSessionDB {
  if (typeof window === "undefined") {
    throw new Error("getDB() solo puede usarse en el navegador");
  }
  if (!_db) {
    _db = new ActiveSessionDB();
  }
  return _db;
}
