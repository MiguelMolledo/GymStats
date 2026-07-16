import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

/**
 * Serwist convierte la app en PWA instalable con service worker.
 *
 * Decisión (Fase 6): usamos `@serwist/next` (plugin de webpack, `InjectManifest`)
 * en lugar de `@serwist/turbopack`. El plugin de webpack es la vía madura y
 * documentada; `@serwist/turbopack` aún es experimental (compila el SW en un
 * route handler que hace `spawn` de git/esbuild en runtime). Por eso el `build`
 * usa `next build --webpack` (ver package.json) mientras que `dev` sigue con
 * Turbopack. El SW se deshabilita en desarrollo.
 */
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Cachea el HTML de las navegaciones (network-first) para arrancar offline.
  cacheOnNavigation: true,
  // Recarga automáticamente al recuperar conexión.
  reloadOnOnline: true,
  // Nunca activo en dev: interferiría con HMR y cachearía datos personales.
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withSerwist(nextConfig);
