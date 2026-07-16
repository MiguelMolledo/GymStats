import { HeaderSkeleton, Skeleton } from "@/components/Skeleton";

/** Skeleton de Historial: cabecera + selector de mes + resumen + sesiones. */
export default function LoadingHistorial() {
  return (
    <>
      <HeaderSkeleton />
      {/* Selector de mes */}
      <div className="flex items-center justify-between px-5 py-4">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
      <div className="space-y-4 px-5">
        {/* Resumen del mes */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        </div>
        {/* Lista de sesiones */}
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      </div>
    </>
  );
}
