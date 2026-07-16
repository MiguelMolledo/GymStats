/**
 * Bloque de esqueleto oscuro reutilizable. Silueta tenue con pulso suave,
 * coherente con el tema (#030303 + glows). Sin spinners genéricos.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-skeleton rounded-md bg-white/[0.06] ${className}`}
    />
  );
}

/** Cabecera de esqueleto que imita el Header sticky (título + subtítulo). */
export function HeaderSkeleton() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#030303]/70 backdrop-blur-xl">
      <div className="flex items-center justify-between px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-44" />
        </div>
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
    </header>
  );
}

/** Tarjeta de esqueleto genérica (silueta de card redondeada). */
export function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-white/[0.03] p-5 ${className}`}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}
