import { CardSkeleton, HeaderSkeleton, Skeleton } from "@/components/Skeleton";

/** Skeleton de Inicio: cabecera + banner + tarjetas del dashboard. */
export default function LoadingInicio() {
  return (
    <>
      <HeaderSkeleton />
      <div className="space-y-4 px-5 pt-4">
        {/* Banner de sesión en curso / bloques */}
        <Skeleton className="h-20 rounded-2xl" />
        {/* Tarjetas del dashboard del plugin */}
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </>
  );
}
