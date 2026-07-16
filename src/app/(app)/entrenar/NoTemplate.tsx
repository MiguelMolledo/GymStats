import { Dumbbell } from "lucide-react";
import Link from "next/link";

/** Estado cuando el usuario no tiene una plantilla activa. */
export function NoTemplate() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
        <Dumbbell className="h-6 w-6 text-white/40" />
      </div>
      <p className="text-sm font-medium text-white/70">
        No tienes un entrenamiento activo
      </p>
      <p className="max-w-[240px] text-xs text-white/40">
        Configura una plantilla para empezar a registrar tus sesiones.
      </p>
      <Link
        href="/plantillas"
        className="mt-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
      >
        Ver plantillas
      </Link>
    </div>
  );
}

/** Estado cuando la plantilla activa aún no tiene bloques/ejercicios. */
export function EmptyTemplate({ templateId }: { templateId: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
        <Dumbbell className="h-6 w-6 text-white/40" />
      </div>
      <p className="text-sm font-medium text-white/70">
        Tu plantilla no tiene bloques
      </p>
      <p className="max-w-[240px] text-xs text-white/40">
        Añade bloques y ejercicios a tu plantilla para poder entrenar.
      </p>
      <Link
        href={`/plantillas/${templateId}`}
        className="mt-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
      >
        Añade bloques a tu plantilla
      </Link>
    </div>
  );
}
