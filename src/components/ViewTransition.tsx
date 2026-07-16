"use client";

import { usePathname } from "next/navigation";

/**
 * Envuelve el contenido de las vistas y re-dispara una transición de entrada
 * (fade + slide-up) en cada cambio de ruta, usando `key={pathname}` para
 * forzar el remontaje del contenedor animado. CSS puro, sin dependencias.
 */
export function ViewTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-view-enter">
      {children}
    </div>
  );
}
