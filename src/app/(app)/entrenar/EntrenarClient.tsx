"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { PreviousSet } from "@/features/active-session/logic";
import { rehydrateRemoteSession } from "@/features/active-session/rehydrate";
import { useSessionStore } from "@/features/active-session/store";
import { getSyncEngine } from "@/features/active-session/sync";

import { BlockSelector } from "./BlockSelector";
import { SessionForm } from "./SessionForm";

export type EntrenarBlock = {
  id: string;
  slug: string;
  label: string;
  emoji: string | null;
  accent_color: string | null;
  position: number;
};

export type EntrenarExercise = {
  id: string;
  block_id: string;
  name: string;
  target_sets: number;
  is_core: boolean;
  position: number;
};

export type EntrenarData = {
  userId: string;
  template: {
    id: string;
    name: string;
    plugin_key: string;
    config: unknown;
  };
  blocks: EntrenarBlock[];
  exercises: EntrenarExercise[];
  prefillByBlock: Record<string, PreviousSet[]>;
};

function today(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
}

export function EntrenarClient({
  data,
  preselectSlug = null,
}: {
  data: EntrenarData;
  preselectSlug?: string | null;
}) {
  const router = useRouter();
  const hydrated = useSessionStore((s) => s.hydrated);
  const session = useSessionStore((s) => s.session);
  const hydrate = useSessionStore((s) => s.hydrate);
  const startSession = useSessionStore((s) => s.startSession);
  const completeSession = useSessionStore((s) => s.completeSession);
  const resetMemory = useSessionStore((s) => s.resetMemory);
  const [finishing, setFinishing] = useState(false);
  const preselectHandled = useRef(false);
  const rehydrateHandled = useRef(false);
  // La preselección por slug debe esperar a que la rehidratación remota decida:
  // si hay una sesión remota activa, gana ella y NO se auto-arranca un bloque.
  const [rehydrateChecked, setRehydrateChecked] = useState(false);

  // Al montar: hidrata la sesión local (y arranca el sync pendiente). Si no hay
  // sesión local, intenta rehidratar una que solo exista en remoto (el usuario
  // perdió el IndexedDB) para reabrir el formulario en vez del selector.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      await hydrate();
      if (cancelled) return;
      // Solo una vez por montaje, y solo si no hay ya sesión en el store.
      if (!rehydrateHandled.current && !useSessionStore.getState().session) {
        rehydrateHandled.current = true;
        try {
          const rehydrated = await rehydrateRemoteSession({
            supabase: createClient(),
            userId: data.userId,
            template: {
              id: data.template.id,
              plugin_key: data.template.plugin_key,
            },
            blocks: data.blocks,
            exercises: data.exercises,
          });
          // Si rehidrató y el usuario no arrancó nada entretanto, abre el form.
          if (
            !cancelled &&
            rehydrated &&
            !useSessionStore.getState().session
          ) {
            await hydrate();
          }
        } catch {
          // Sin red o error: silencio (el banner permite descartar).
        }
      }
      if (!cancelled) setRehydrateChecked(true);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [hydrate, data.userId, data.template, data.blocks, data.exercises]);

  const exercisesByBlock = useMemo(() => {
    const map = new Map<string, EntrenarExercise[]>();
    for (const ex of data.exercises) {
      (map.get(ex.block_id) ?? map.set(ex.block_id, []).get(ex.block_id)!).push(
        ex,
      );
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [data.exercises]);

  async function handleSelectBlock(block: EntrenarBlock) {
    const exercises = exercisesByBlock.get(block.id) ?? [];
    await startSession({
      userId: data.userId,
      templateId: data.template.id,
      blockId: block.id,
      pluginKey: data.template.plugin_key,
      performedOn: today(),
      exercises: exercises.map((e) => ({
        id: e.id,
        name: e.name,
        target_sets: e.target_sets,
        is_core: e.is_core,
        position: e.position,
      })),
      previousSets: data.prefillByBlock[block.id] ?? [],
    });
  }

  // Preselección de bloque desde el Dashboard (?bloque=slug): solo si ya
  // hidratamos, resolvimos la rehidratación remota y NO hay sesión activa; se
  // aplica una única vez. Esperar a `rehydrateChecked` evita competir con la
  // rehidratación (una remota activa gana y no debe auto-arrancar bloque nuevo).
  useEffect(() => {
    if (!hydrated || !rehydrateChecked || preselectHandled.current || !preselectSlug)
      return;
    const current = useSessionStore.getState().session;
    if (current && current.status === "active") {
      preselectHandled.current = true;
      return;
    }
    const block = data.blocks.find((b) => b.slug === preselectSlug);
    if (!block) {
      preselectHandled.current = true;
      return;
    }
    preselectHandled.current = true;
    void handleSelectBlock(block);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, rehydrateChecked, preselectSlug]);

  async function handleFinish() {
    const current = useSessionStore.getState().session;
    if (!current || finishing) return;
    setFinishing(true);

    // 1) Marca completed en Dexie (+ hook del plugin pendiente).
    await completeSession();

    // 2) Intenta volcar TODO ya: push de sesión+sets, hook del plugin y
    //    limpieza local, todo dentro del motor de sync. Si estamos offline o
    //    falla, los datos quedan intactos en Dexie y el motor (backoff +
    //    listener `online` + hidrataciones) lo reintentará.
    const engine = getSyncEngine();
    engine.init(createClient());
    try {
      await engine.flush();
    } catch {
      // el motor sigue reintentando en segundo plano.
    }

    // 3) Limpia SOLO la memoria (nunca Dexie) y vuelve a Inicio.
    resetMemory();
    router.replace("/");
    router.refresh();
  }

  if (!hydrated) {
    return (
      <div className="px-5 py-10 text-center text-sm text-white/40">
        Cargando…
      </div>
    );
  }

  if (finishing) {
    return (
      <div className="px-5 py-10 text-center text-sm text-white/40">
        Guardando entrenamiento…
      </div>
    );
  }

  if (!session || session.status !== "active") {
    return (
      <BlockSelector
        blocks={data.blocks}
        exercisesByBlock={exercisesByBlock}
        onSelect={handleSelectBlock}
      />
    );
  }

  const block = data.blocks.find((b) => b.id === session.block_id) ?? null;

  return (
    <SessionForm
      block={block}
      exercises={exercisesByBlock.get(session.block_id) ?? []}
      template={data.template}
      finishing={finishing}
      onFinish={handleFinish}
    />
  );
}
