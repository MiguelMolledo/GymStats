"use client";

import { Check, CloudOff, Loader2, TriangleAlert } from "lucide-react";

import { useSyncStatus } from "@/features/active-session/useSyncStatus";

const LABELS = {
  saved: "Guardado",
  saving: "Guardando…",
  offline: "Sin conexión — se guardará al reconectar",
  error: "Error de sincronización",
} as const;

/** Indicador de estado de guardado en la cabecera del form. */
export function SyncIndicator() {
  const status = useSyncStatus();
  const label = LABELS[status];

  const cls =
    status === "saved"
      ? "text-emerald-300"
      : status === "saving"
        ? "text-white/50"
        : status === "offline"
          ? "text-amber-300"
          : "text-red-300";

  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${cls}`}>
      {status === "saved" && <Check className="h-3.5 w-3.5" />}
      {status === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {status === "offline" && <CloudOff className="h-3.5 w-3.5" />}
      {status === "error" && <TriangleAlert className="h-3.5 w-3.5" />}
      <span className="truncate">{label}</span>
    </div>
  );
}
