import { HeaderSkeleton, Skeleton } from "@/components/Skeleton";

/** Skeleton de Plantillas: cabecera + botón crear + tarjetas de plantilla. */
export default function LoadingPlantillas() {
  return (
    <>
      <HeaderSkeleton />
      <div className="space-y-4 px-5 pt-4">
        {/* Botón crear plantilla */}
        <Skeleton className="h-12 rounded-2xl" />
        {/* Tarjetas de plantilla */}
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-7 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
