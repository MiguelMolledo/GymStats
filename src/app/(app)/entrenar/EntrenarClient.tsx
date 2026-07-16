"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { PreviousSet } from "@/features/active-session/logic";
import { useSessionStore } from "@/features/active-session/store";
import { getSyncEngine } from "@/features/active-session/sync";
import { getDB } from "@/features/active-session/db";
import { getPlugin } from "@/plugins/registry";
import type { CompletedSet } from "@/plugins/types";

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

export function EntrenarClient({ data }: { data: EntrenarData }) {
  const router = useRouter();
  const hydrated = useSessionStore((s) => s.hydrated);
  const session = useSessionStore((s) => s.session);
  const hydrate = useSessionStore((s) => s.hydrate);
  const startSession = useSessionStore((s) => s.startSession);
  const completeSession = useSessionStore((s) => s.completeSession);
  const clearLocal = useSessionStore((s) => s.clearLocal);
  const [finishing, setFinishing] = useState(false);

  // Hidrata la sesión activa local al montar.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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

  async function handleFinish() {
    const current = useSessionStore.getState().session;
    if (!current || finishing) return;
    setFinishing(true);
    const engine = getSyncEngine();
    engine.init(createClient());

    // 1) Marca completed localmente.
    await completeSession();

    // 2) Intenta volcar todo a remoto.
    const online =
      typeof navigator === "undefined" || navigator.onLine !== false;
    let plainCompleted = false;

    if (online) {
      try {
        await engine.flush();
        plainCompleted = true;
      } catch {
        plainCompleted = false;
      }
    }

    // 3) Si estamos online y todo se subió, ejecuta el hook del plugin.
    if (plainCompleted) {
      await runPluginHook(current.block_id);
    } else {
      // Offline (o fallo): deja pendiente el hook para ejecutarlo al reconectar.
      await getDB().localSessions.update(current.id, {
        pendingCompletedHook: 1,
      });
    }

    // 4) Limpia el estado local y vuelve a Inicio.
    await clearLocal();
    router.replace("/");
    router.refresh();
  }

  async function runPluginHook(blockId: string) {
    const plugin = getPlugin(data.template.plugin_key);
    if (!plugin?.onSessionCompleted) return;
    const state = useSessionStore.getState();
    const sess = state.session;
    if (!sess) return;
    const supabase = createClient();
    const parsed = plugin.parseConfig(data.template.config);

    const exerciseInfo = new Map(
      data.exercises.map((e) => [e.id, e]),
    );
    const finalSets: CompletedSet[] = state.sets
      .filter((s) => s.weight.trim() !== "" || s.reps.trim() !== "" || s.notes.trim() !== "")
      .map((s) => ({
        exercise_id: s.exercise_id,
        set_number: s.set_number,
        weight: s.weight.trim() === "" ? null : Number(s.weight.replace(",", ".")),
        reps: s.reps.trim() === "" ? null : Math.trunc(Number(s.reps)),
        notes: s.notes.trim(),
        is_core: exerciseInfo.get(s.exercise_id)?.is_core ?? false,
      }));

    try {
      await plugin.onSessionCompleted({
        supabase,
        session: {
          id: sess.id,
          user_id: sess.user_id,
          template_id: sess.template_id,
          block_id: blockId,
          performed_on: sess.performed_on,
        },
        sets: finalSets,
        config: parsed,
        template: {
          id: data.template.id,
          config: data.template.config as never,
          plugin_key: data.template.plugin_key,
        },
        blocks: data.blocks.map((b) => ({
          id: b.id,
          slug: b.slug,
          label: b.label,
          emoji: b.emoji,
          accent_color: b.accent_color,
          position: b.position,
          template_id: data.template.id,
        })),
        exercises: data.exercises.map((e) => ({
          id: e.id,
          block_id: e.block_id,
          name: e.name,
          target_sets: e.target_sets,
          is_core: e.is_core,
          position: e.position,
          archived: false,
        })),
      });
    } catch {
      // best-effort; el ciclo se recalculará en Fase 3 si algo falla.
    }
  }

  if (!hydrated) {
    return (
      <div className="px-5 py-10 text-center text-sm text-white/40">
        Cargando…
      </div>
    );
  }

  if (!session) {
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
