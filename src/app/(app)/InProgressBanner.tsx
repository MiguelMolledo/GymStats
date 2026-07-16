"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { getDB } from "@/features/active-session/db";
import { getSyncEngine } from "@/features/active-session/sync";

type BannerData = {
  blockLabel: string;
  emoji: string | null;
  /** origen: si solo existe remota, hay que bajarla a local al continuar. */
  source: "local" | "remote";
  remoteSessionId?: string;
};

/** Nombre del bloque a partir del id (una query ligera). */
export function InProgressBanner({
  blocks,
}: {
  blocks: { id: string; label: string; emoji: string | null }[];
}) {
  const router = useRouter();
  const [data, setData] = useState<BannerData | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const blockOf = (id: string) => blocks.find((b) => b.id === id) ?? null;

      // 1) Local gana.
      let local = null as Awaited<
        ReturnType<typeof getLocalActive>
      >;
      try {
        local = await getLocalActive();
      } catch {
        local = null;
      }
      if (local) {
        const b = blockOf(local.block_id);
        if (!cancelled) {
          setData({
            blockLabel: b?.label ?? "Sesión",
            emoji: b?.emoji ?? null,
            source: "local",
          });
          setChecked(true);
        }
        return;
      }

      // 2) Remota.
      try {
        const supabase = createClient();
        const { data: remote } = await supabase
          .from("workout_sessions")
          .select("id, block_id")
          .eq("status", "active")
          .maybeSingle();
        if (remote && !cancelled) {
          const b = blockOf(remote.block_id);
          setData({
            blockLabel: b?.label ?? "Sesión",
            emoji: b?.emoji ?? null,
            source: "remote",
            remoteSessionId: remote.id,
          });
        }
      } catch {
        // sin red: no hay banner remoto.
      }
      if (!cancelled) setChecked(true);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [blocks]);

  async function handleContinue() {
    router.push("/entrenar");
  }

  async function handleDiscard() {
    if (!data || busy) return;
    if (!window.confirm("¿Descartar el entrenamiento en curso?")) return;
    setBusy(true);
    try {
      if (data.source === "local") {
        const db = getDB();
        const active = await getLocalActive();
        if (active) {
          const supabase = createClient();
          if (active.syncedInsert === 1) {
            try {
              await supabase
                .from("workout_sessions")
                .update({ status: "discarded" })
                .eq("id", active.id);
            } catch {
              /* best-effort */
            }
          }
          await db.transaction("rw", db.localSessions, db.localSets, async () => {
            await db.localSets.where("session_id").equals(active.id).delete();
            await db.localSessions.delete(active.id);
          });
        }
        getSyncEngine().reset();
      } else if (data.remoteSessionId) {
        const supabase = createClient();
        await supabase
          .from("workout_sessions")
          .update({ status: "discarded" })
          .eq("id", data.remoteSessionId);
      }
      setData(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!checked || !data) return null;

  return (
    <div className="mx-5 mt-4 rounded-3xl border border-indigo-400/30 bg-indigo-500/10 p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">{data.emoji ?? <Dumbbell className="h-4 w-4" />}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            Entrenamiento en curso
          </p>
          <p className="truncate text-xs text-white/50">{data.blockLabel}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleContinue}
          className="flex-1 rounded-xl bg-indigo-500 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
        >
          Continuar
        </button>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={busy}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white/60 transition hover:bg-white/5 disabled:opacity-50"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}

async function getLocalActive() {
  const db = getDB();
  const session = await db.localSessions.where("status").equals("active").first();
  return session ?? null;
}
