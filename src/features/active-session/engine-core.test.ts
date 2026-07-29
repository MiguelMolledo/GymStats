import { describe, expect, it, vi } from "vitest";

import type { LocalSession } from "./db";
import {
  ActiveSessionConflictError,
  isAllClean,
  orderForPush,
  pushAll,
  runPendingHooks,
  sessionNeedsPush,
  sessionToUpsert,
  type EngineRemote,
  type EngineStorage,
  type SessionUpsertPayload,
} from "./engine-core";
import type { LocalSet, RemoteSet } from "./logic";

// ---------------------------------------------------------------------------
// Fakes en memoria
// ---------------------------------------------------------------------------

class FakeStorage implements EngineStorage {
  sessions = new Map<string, LocalSession>();
  sets = new Map<string, LocalSet>();

  async getPendingSessions() {
    return [...this.sessions.values()];
  }
  async getDirtySets(sessionId: string) {
    return [...this.sets.values()].filter(
      (s) => s.session_id === sessionId && s.dirty === 1,
    );
  }
  async getSets(sessionId: string) {
    return [...this.sets.values()].filter((s) => s.session_id === sessionId);
  }
  async markSessionPushed(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (s) this.sessions.set(sessionId, { ...s, syncedInsert: 1, dirty: 0 });
  }
  async markSetsClean(setIds: string[]) {
    for (const id of setIds) {
      const s = this.sets.get(id);
      if (s) this.sets.set(id, { ...s, dirty: 0 });
    }
  }
  async clearPendingHook(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (s) this.sessions.set(sessionId, { ...s, pendingCompletedHook: 0 });
  }
  async deleteSessionAndSets(sessionId: string) {
    this.sessions.delete(sessionId);
    for (const [id, s] of this.sets) {
      if (s.session_id === sessionId) this.sets.delete(id);
    }
  }
}

class FakeRemote implements EngineRemote {
  offline = false;
  sessions = new Map<string, SessionUpsertPayload>();
  sets = new Map<string, RemoteSet>();
  // Simulación del conflicto "una activa por usuario":
  //  - "active": el upsert de una sesión active lanza conflicto.
  //  - "any": lo lanza para cualquier estado (para el caso NO active).
  throwConflictFor: "active" | "any" | null = null;
  // Si true, discardOtherActiveSessions NO libera el conflicto → el retry falla.
  failRetryAfterDiscard = false;
  discardCalls: Array<{ userId: string; keepSessionId: string }> = [];

  async upsertSession(payload: SessionUpsertPayload) {
    if (this.offline) throw new Error("network down");
    const conflicts =
      this.throwConflictFor === "any" ||
      (this.throwConflictFor === "active" && payload.status === "active");
    if (conflicts) throw new ActiveSessionConflictError();
    this.sessions.set(payload.id, payload);
  }
  async upsertSets(payload: RemoteSet[]) {
    if (this.offline) throw new Error("network down");
    for (const s of payload) this.sets.set(s.id, s);
  }
  async discardOtherActiveSessions(userId: string, keepSessionId: string) {
    this.discardCalls.push({ userId, keepSessionId });
    // Libera la huérfana (salvo que el test fuerce un retry fallido).
    if (!this.failRetryAfterDiscard) this.throwConflictFor = null;
  }
}

const session = (over: Partial<LocalSession>): LocalSession => ({
  id: "sess1",
  user_id: "u1",
  template_id: "t1",
  block_id: "b1",
  plugin_key: "bilbo",
  performed_on: "2026-07-16",
  notes: "",
  started_at: "2026-07-16T10:00:00.000Z",
  completed_at: null,
  status: "active",
  dirty: 1,
  syncedInsert: 0,
  pendingCompletedHook: 0,
  ...over,
});

const localSet = (over: Partial<LocalSet>): LocalSet => ({
  id: "set1",
  session_id: "sess1",
  exercise_id: "ex1",
  exercise_name: "Press",
  set_number: 1,
  weight: "80",
  reps: "12",
  notes: "",
  dirty: 1,
  updated_at: "2026-07-16T10:05:00.000Z",
  ...over,
});

function completedPendingFixture() {
  const storage = new FakeStorage();
  const remote = new FakeRemote();
  storage.sessions.set(
    "sess1",
    session({
      status: "completed",
      dirty: 1,
      syncedInsert: 1,
      completed_at: "2026-07-16T11:00:00.000Z",
      pendingCompletedHook: 1,
    }),
  );
  storage.sets.set("set1", localSet({ id: "set1", dirty: 1 }));
  storage.sets.set(
    "set2",
    localSet({ id: "set2", set_number: 2, weight: "", reps: "", dirty: 1 }),
  );
  return { storage, remote };
}

// ---------------------------------------------------------------------------
// (a) La sesión COMPLETED cuenta como pendiente y el flush la empuja.
// ---------------------------------------------------------------------------
describe("completed session is pushed (bug 1)", () => {
  it("isAllClean is false for a dirty completed session", async () => {
    const { storage } = completedPendingFixture();
    expect(await isAllClean(storage)).toBe(false);
  });

  it("pushAll upserts the completed session with its final status and sets", async () => {
    const { storage, remote } = completedPendingFixture();
    await pushAll(storage, remote);

    const pushed = remote.sessions.get("sess1");
    expect(pushed?.status).toBe("completed");
    expect(pushed?.completed_at).toBe("2026-07-16T11:00:00.000Z");
    // set no vacío subido; el vacío no.
    expect(remote.sets.has("set1")).toBe(true);
    expect(remote.sets.has("set2")).toBe(false);
    // local marcado clean.
    expect(storage.sessions.get("sess1")?.dirty).toBe(0);
    expect(storage.sets.get("set1")?.dirty).toBe(0);
    expect(storage.sets.get("set2")?.dirty).toBe(0);
  });

  it("isAllClean stays false until the pending hook runs", async () => {
    const { storage, remote } = completedPendingFixture();
    await pushAll(storage, remote);
    expect(await isAllClean(storage)).toBe(false); // hook pendiente
    await runPendingHooks(storage, async () => {});
    expect(await isAllClean(storage)).toBe(true);
  });

  it("orders non-active sessions before the active one (remote unique index)", () => {
    const done = session({ id: "old", status: "completed" });
    const active = session({ id: "new", status: "active" });
    expect(orderForPush([active, done]).map((s) => s.id)).toEqual([
      "old",
      "new",
    ]);
  });
});

// ---------------------------------------------------------------------------
// (b) Flujo offline completo: terminar sin red NO borra nada; al
// "reconectar" se sube todo y se ejecuta el hook.
// ---------------------------------------------------------------------------
describe("offline completion keeps data and syncs on reconnect (bug 2)", () => {
  it("push fails offline, local data survives, then full sync + hook", async () => {
    const storage = new FakeStorage();
    const remote = new FakeRemote();
    remote.offline = true;

    // Sesión completada 100% offline: nunca insertada en remoto.
    storage.sessions.set(
      "sess1",
      session({
        status: "completed",
        dirty: 1,
        syncedInsert: 0,
        completed_at: "2026-07-16T11:00:00.000Z",
        pendingCompletedHook: 1,
      }),
    );
    storage.sets.set("set1", localSet({ id: "set1" }));

    // Intento offline: falla y NO borra nada de local.
    await expect(pushAll(storage, remote)).rejects.toThrow();
    expect(storage.sessions.has("sess1")).toBe(true);
    expect(storage.sets.has("set1")).toBe(true);
    expect(await isAllClean(storage)).toBe(false);

    // El hook NO corre mientras la sesión no esté volcada.
    const earlyHook = vi.fn(async () => {});
    await runPendingHooks(storage, earlyHook);
    expect(earlyHook).not.toHaveBeenCalled();
    expect(storage.sessions.has("sess1")).toBe(true);

    // "Reconecta": push completo + hook + limpieza local.
    remote.offline = false;
    await pushAll(storage, remote);
    expect(remote.sessions.get("sess1")?.status).toBe("completed");
    expect(remote.sets.has("set1")).toBe(true);

    const hook = vi.fn(async (_s: LocalSession, sets: LocalSet[]) => {
      expect(sets.map((x) => x.id)).toEqual(["set1"]);
    });
    await runPendingHooks(storage, hook);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(storage.sessions.has("sess1")).toBe(false);
    expect(storage.sets.has("set1")).toBe(false);
    expect(await isAllClean(storage)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (c) El runner de hooks es idempotente: nunca dos ejecuciones.
// ---------------------------------------------------------------------------
describe("hook runner idempotency", () => {
  it("does not run the hook twice across invocations", async () => {
    const { storage, remote } = completedPendingFixture();
    await pushAll(storage, remote);
    const hook = vi.fn(async () => {});
    await runPendingHooks(storage, hook);
    await runPendingHooks(storage, hook);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it("keeps the session pending if the hook throws, and retries later", async () => {
    const { storage, remote } = completedPendingFixture();
    await pushAll(storage, remote);
    const failing = vi.fn(async () => {
      throw new Error("hook network error");
    });
    await expect(runPendingHooks(storage, failing)).rejects.toThrow();
    // Sigue en local, con el hook pendiente.
    expect(storage.sessions.get("sess1")?.pendingCompletedHook).toBe(1);

    const ok = vi.fn(async () => {});
    await runPendingHooks(storage, ok);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(storage.sessions.has("sess1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Descartes y utilidades
// ---------------------------------------------------------------------------
describe("discarded sessions", () => {
  it("a discarded session never inserted remotely is just deleted locally", async () => {
    const storage = new FakeStorage();
    const remote = new FakeRemote();
    storage.sessions.set(
      "sess1",
      session({ status: "discarded", dirty: 1, syncedInsert: 0 }),
    );
    storage.sets.set("set1", localSet({}));
    await pushAll(storage, remote);
    expect(remote.sessions.size).toBe(0);
    expect(storage.sessions.size).toBe(0);
    expect(storage.sets.size).toBe(0);
  });

  it("a discarded session that exists remotely is pushed then cleaned up", async () => {
    const storage = new FakeStorage();
    const remote = new FakeRemote();
    storage.sessions.set(
      "sess1",
      session({ status: "discarded", dirty: 1, syncedInsert: 1 }),
    );
    await pushAll(storage, remote);
    expect(remote.sessions.get("sess1")?.status).toBe("discarded");
    const hook = vi.fn(async () => {});
    await runPendingHooks(storage, hook);
    expect(hook).not.toHaveBeenCalled();
    expect(storage.sessions.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Autorrecuperación del conflicto "una activa por usuario" (fila huérfana).
// ---------------------------------------------------------------------------
describe("active-session conflict self-heal", () => {
  it("(a) discards other actives and the retry succeeds → session pushed", async () => {
    const storage = new FakeStorage();
    const remote = new FakeRemote();
    remote.throwConflictFor = "active";
    storage.sessions.set(
      "sess1",
      session({ status: "active", dirty: 1, syncedInsert: 0 }),
    );

    await pushAll(storage, remote);

    // Se pidió descartar las otras activas (todas menos la nuestra).
    expect(remote.discardCalls).toEqual([
      { userId: "u1", keepSessionId: "sess1" },
    ]);
    // El retry triunfó y la sesión quedó en remoto + marcada como pushed.
    expect(remote.sessions.get("sess1")?.status).toBe("active");
    expect(storage.sessions.get("sess1")?.syncedInsert).toBe(1);
    expect(storage.sessions.get("sess1")?.dirty).toBe(0);
  });

  it("(b) propagates if the retry after self-heal still conflicts", async () => {
    const storage = new FakeStorage();
    const remote = new FakeRemote();
    remote.throwConflictFor = "active";
    remote.failRetryAfterDiscard = true;
    storage.sessions.set(
      "sess1",
      session({ status: "active", dirty: 1, syncedInsert: 0 }),
    );

    await expect(pushAll(storage, remote)).rejects.toBeInstanceOf(
      ActiveSessionConflictError,
    );
    // Se intentó el self-heal una vez, pero la sesión NO se marca pushed.
    expect(remote.discardCalls.length).toBe(1);
    expect(storage.sessions.get("sess1")?.syncedInsert).toBe(0);
  });

  it("(c) propagates a conflict on a NON-active session without self-heal", async () => {
    const storage = new FakeStorage();
    const remote = new FakeRemote();
    remote.throwConflictFor = "any";
    storage.sessions.set(
      "sess1",
      session({ status: "completed", dirty: 1, syncedInsert: 0 }),
    );

    await expect(pushAll(storage, remote)).rejects.toBeInstanceOf(
      ActiveSessionConflictError,
    );
    // Sin autorrecuperación para estados que no son 'active'.
    expect(remote.discardCalls.length).toBe(0);
  });
});

describe("helpers", () => {
  it("sessionNeedsPush", () => {
    expect(sessionNeedsPush(session({ syncedInsert: 0, dirty: 0 }))).toBe(true);
    expect(sessionNeedsPush(session({ syncedInsert: 1, dirty: 1 }))).toBe(true);
    expect(sessionNeedsPush(session({ syncedInsert: 1, dirty: 0 }))).toBe(
      false,
    );
  });
  it("sessionToUpsert maps completed_at null by default", () => {
    const payload = sessionToUpsert(session({}));
    expect(payload.completed_at).toBeNull();
    expect(payload.status).toBe("active");
  });
});
