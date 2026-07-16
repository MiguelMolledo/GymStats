import { CardSkeleton, HeaderSkeleton, Skeleton } from "@/components/Skeleton";

/** Skeleton de una ExtraView de plugin (p. ej. Ciclos): cabecera + filtros + tarjetas. */
export default function LoadingExtraView() {
  return (
    <>
      <HeaderSkeleton />
      {/* Chips de filtro */}
      <div className="flex gap-2 overflow-hidden px-5 py-4">
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      {/* Tarjetas de ciclo */}
      <div className="space-y-4 px-5">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </>
  );
}
