/**
 * Núcleo del motor de sincronización, con dependencias inyectadas
 * (storage local + remoto) para poder testearlo con fakes en memoria.
 * El SyncEngine de sync.ts lo instancia con Dexie + Supabase reales.
 */

import type { LocalSession } from "./db";
import { selectSetsToSync, type LocalSet, type RemoteSet } from "./logic";

/** Payload de la sesión listo para upsert a workout_sessions. */
export type SessionUpsertPayload = {
  id: string;
  user_id: string;
  template_id: string;
  block_id: string;
  performed_on: string;
  notes: string;
  status: "active" | "completed" | "discarded";
  started_at: string;
  completed_at: string | null;
};

export interface EngineStorage {
  /** Sesiones locales con trabajo potencialmente pendiente (todas). */
  getPendingSessions(): Promise<LocalSession[]>;
  getDirtySets(sessionId: string): Promise<LocalSet[]>;
  getSets(sessionId: string): Promise<LocalSet[]>;
  /** Marca la fila de sesión como volcada (syncedInsert=1, dirty=0). */
  markSessionPushed(sessionId: string): Promise<void>;
  markSetsClean(setIds: string[]): Promise<void>;
  clearPendingHook(sessionId: string): Promise<void>;
  /** Borra la sesión local y todos sus sets. */
  deleteSessionAndSets(sessionId: string): Promise<void>;
}

export interface EngineRemote {
  upsertSession(payload: SessionUpsertPayload): Promise<void>;
  upsertSets(payload: RemoteSet[]): Promise<void>;
}

/** Mapea la sesión local al payload remoto. Función pura. */
export function sessionToUpsert(s: LocalSession): SessionUpsertPayload {
  return {
    id: s.id,
    user_id: s.user_id,
    template_id: s.template_id,
    block_id: s.block_id,
    performed_on: s.performed_on,
    notes: s.notes,
    status: s.status,
    started_at: s.started_at,
    completed_at: s.completed_at ?? null,
  };
}

/** ¿La fila de sesión necesita volcarse (insert pendiente o cambios)? */
export function sessionNeedsPush(s: LocalSession): boolean {
  return s.syncedInsert === 0 || s.dirty === 1;
}

/**
 * Orden de push: sesiones NO activas primero, para liberar en remoto el
 * índice único "una activa por usuario" antes de insertar una nueva activa.
 */
export function orderForPush(sessions: LocalSession[]): LocalSession[] {
  return [...sessions].sort(
    (a, b) => (a.status === "active" ? 1 : 0) - (b.status === "active" ? 1 : 0),
  );
}

/**
 * Un ciclo de push: vuelca a remoto todas las sesiones pendientes y sus sets
 * dirty no vacíos. Lanza en el primer error (el caller decide backoff).
 * Excepción: una sesión descartada que NUNCA llegó a remoto no se envía;
 * se borra directamente en local.
 */
export async function pushAll(
  storage: EngineStorage,
  remote: EngineRemote,
): Promise<void> {
  const sessions = orderForPush(await storage.getPendingSessions());
  for (const session of sessions) {
    if (session.status === "discarded" && session.syncedInsert === 0) {
      await storage.deleteSessionAndSets(session.id);
      continue;
    }
    if (sessionNeedsPush(session)) {
      await remote.upsertSession(sessionToUpsert(session));
      await storage.markSessionPushed(session.id);
    }
    const dirtySets = await storage.getDirtySets(session.id);
    const payload = selectSetsToSync(dirtySets);
    if (payload.length > 0) {
      await remote.upsertSets(payload);
    }
    // Los dirty vacíos también quedan clean: nunca se envían.
    if (dirtySets.length > 0) {
      await storage.markSetsClean(dirtySets.map((s) => s.id));
    }
  }
}

/**
 * ¿Está todo limpio? (nada que volcar y ningún hook de cierre pendiente).
 */
export async function isAllClean(storage: EngineStorage): Promise<boolean> {
  const sessions = await storage.getPendingSessions();
  for (const session of sessions) {
    if (session.status === "discarded" && session.syncedInsert === 0) continue;
    if (sessionNeedsPush(session)) return false;
    if (session.status === "completed" && session.pendingCompletedHook === 1) {
      return false;
    }
    const dirtySets = await storage.getDirtySets(session.id);
    if (selectSetsToSync(dirtySets).length > 0) return false;
  }
  return true;
}

/**
 * Ejecuta los hooks de cierre pendientes de sesiones completed ya volcadas
 * y limpia de local las sesiones terminadas sin nada pendiente.
 * Idempotente: tras un run con éxito la sesión desaparece de local, por lo
 * que una segunda llamada no vuelve a ejecutar el hook.
 * Lanza si el hook falla (la sesión queda pendiente para el reintento).
 */
export async function runPendingHooks(
  storage: EngineStorage,
  runHook: (session: LocalSession, sets: LocalSet[]) => Promise<void>,
): Promise<void> {
  const sessions = await storage.getPendingSessions();
  for (const session of sessions) {
    if (session.status === "active") continue;
    // Solo cuando la sesión está completamente volcada.
    if (sessionNeedsPush(session)) continue;
    const dirtySets = await storage.getDirtySets(session.id);
    if (selectSetsToSync(dirtySets).length > 0) continue;

    if (session.status === "completed" && session.pendingCompletedHook === 1) {
      const sets = await storage.getSets(session.id);
      await runHook(session, sets);
      await storage.clearPendingHook(session.id);
    }
    // Terminada (completed con hook hecho, o discarded) y limpia: fuera de local.
    await storage.deleteSessionAndSets(session.id);
  }
}
