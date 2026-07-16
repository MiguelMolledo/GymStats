import { Construction } from "lucide-react";

/** Contenido temporal "Próximamente" para rutas aún sin implementar. */
export function Placeholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
        <Construction className="h-6 w-6 text-white/40" />
      </div>
      <p className="text-sm text-white/40">Próximamente</p>
    </div>
  );
}
