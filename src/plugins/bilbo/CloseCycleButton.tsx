"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { closeCycle } from "./actions";

/** Botón "Cerrar ciclo": confirma, invoca la server action y refresca. */
export function CloseCycleButton({
  cycleId,
  className,
}: {
  cycleId: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (pending) return;
    if (
      !window.confirm(
        "¿Cerrar este ciclo? Se registrará el peso máximo y las reps de cierre.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await closeCycle(cycleId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-50"
      >
        <CheckCircle2 className="h-4 w-4" />
        {pending ? "Cerrando…" : "Cerrar ciclo"}
      </button>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}
