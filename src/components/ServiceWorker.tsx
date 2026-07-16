"use client";

import { useEffect } from "react";

/**
 * Registra el service worker de la PWA (/sw.js). En desarrollo el SW no se
 * genera (Serwist lo deshabilita), así que sólo intentamos registrarlo en
 * producción. Es un no-op si el navegador no soporta service workers.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Silencioso: la app funciona igual sin SW (sólo pierde offline shell).
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
