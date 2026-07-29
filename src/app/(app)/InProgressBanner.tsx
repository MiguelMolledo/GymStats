"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Dumbbell } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { getDB, type LocalSession } from "@/features/active-session/db";
import { discardLocalSession } from "@/features/active-session/discard";
import { getSyncEngine } from "@/features/active-session/sync";

type BannerData = {
  blockLabel: string;
  emoji: string | null;
  /** origen: si solo existe remota, /entrenar la rehidratará. */
  source: "local" | "remote";
  localSessionId?: string;
  remoteSessionId?: string;
};

/**
 * Banner de Inicio: sesión activa (local gana sobre remota) con
 * Continuar/Descartar, y aviso discreto si hay un entreno terminado
 * pendiente de sincronizar.
 */
export function InProgressBanner({
  blocks,
}: {
  blocks: { id: string; label: string; emoji: string | null }[];
}) {
  const router = useRouter();
  const [data, setData] = useState<BannerData | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discardError, setDiscardError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const blockOf = (id: string) => blocks.find((b) => b.id === id) ?? null;

      let localSessions: LocalSession[] = [];
      try {
        localSessions = await getDB().localSessions.toArray();
      } catch {
        localSessions = [];
      }

      const localActive = localSessions.find((s) => s.status === "active");
      const localPending = localSessions.some((s) => s.status !== "active");

      // Cualquier trabajo local pendiente: arranca el motor de sync
      // (incluye ejecutar hooks de cierre pendientes al reconectar).
      if (localSessions.length > 0) {
        const engine = getSyncEngine();
        engine.init(createClient());
        engine.schedule();
      }

      if (cancelled) return;
      setPendingSync(!localActive && localPending);

      // 1) La sesión LOCAL activa gana.
      if (localActive) {
        const b = blockOf(localActive.block_id);
        setData({
          blockLabel: b?.label ?? "Sesión",
          emoji: b?.emoji ?? null,
          source: "local",
          localSessionId: localActive.id,
        });
        setChecked(true);
        return;
      }

      // 2) Remota, solo si NO hay nada local (si hay pendientes locales, el
      //    estado remoto puede estar desactualizado hasta que se vuelquen).
      if (localSessions.length === 0) {
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
    setDiscardError(false);
    try {
      if (data.source === "local" && data.localSessionId) {
        await discardLocalSession(data.localSessionId);
      } else if (data.remoteSessionId) {
        const supabase = createClient();
        // Descarte remoto: si falla (sin red o error), NO ocultamos el banner
        // para poder reintentar. `.eq("status","active")` lo hace idempotente.
        const { error } = await supabase
          .from("workout_sessions")
          .update({ status: "discarded" })
          .eq("id", data.remoteSessionId)
          .eq("status", "active");
        if (error) {
          setDiscardError(true);
          return;
        }
      }
      setData(null);
      router.refresh();
    } catch {
      // Fallo inesperado (p.ej. sin red): deja el banner para reintentar.
      setDiscardError(true);
    } finally {
      setBusy(false);
    }
  }

  if (!checked) return null;

  if (!data) {
    if (!pendingSync) return null;
    return (
      <div className="mx-5 mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
        <CloudUpload className="h-4 w-4 shrink-0 text-white/40" />
        <p className="text-xs text-white/50">
          Sincronizando entreno pendiente…
        </p>
      </div>
    );
  }

  return (
    <div className="mx-5 mt-4 rounded-3xl border border-indigo-400/30 bg-indigo-500/10 p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">
          {data.emoji ?? <Dumbbell className="h-4 w-4" />}
        </span>
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
      {discardError && (
        <p className="mt-2 text-xs text-red-300">
          No se pudo descartar. Inténtalo de nuevo.
        </p>
      )}
    </div>
  );
}
