"use client";

import { createClient } from "@/lib/supabase/client";

import { getDB } from "./db";
import { getSyncEngine } from "./sync";

/**
 * Descarta una sesión local de forma segura y offline-first:
 *  - si NUNCA llegó a remoto (syncedInsert=0): se borra de local sin más;
 *  - si existe en remoto: se marca discarded+dirty y el motor de sync la
 *    empuja (y la limpia de local) cuando haya red.
 */
export async function discardLocalSession(sessionId: string): Promise<void> {
  const db = getDB();
  const session = await db.localSessions.get(sessionId);
  if (!session) return;

  if (session.syncedInsert === 0) {
    await db.transaction("rw", db.localSessions, db.localSets, async () => {
      await db.localSets.where("session_id").equals(sessionId).delete();
      await db.localSessions.delete(sessionId);
    });
    return;
  }

  await db.localSessions.update(sessionId, {
    status: "discarded",
    dirty: 1,
    pendingCompletedHook: 0,
  });
  const engine = getSyncEngine();
  engine.init(createClient());
  engine.schedule();
}
