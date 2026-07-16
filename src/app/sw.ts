/// <reference lib="webworker" />

/**
 * Service worker de GymStats (compilado por @serwist/next con InjectManifest).
 *
 * Estrategia de caché:
 *  - Precache: el shell y estáticos que Serwist inyecta en `__SW_MANIFEST`.
 *  - Navegaciones (documentos HTML): NetworkFirst. Permite arrancar la app
 *    offline sirviendo el último HTML cacheado, pero prioriza la red para no
 *    servir vistas obsoletas cuando hay conexión.
 *  - API de Supabase (REST/Auth/Realtime): NetworkFirst con expiración MUY
 *    corta y pocas entradas. Los datos son personales y van con auth, así que
 *    nunca se cachean de forma agresiva (cache-first) ni de forma duradera:
 *    la caché sólo actúa como respaldo puntual si la red falla. La sesión de
 *    entreno real es local-first (Dexie), no depende de esta caché.
 *  - Estáticos inmutables (/_next/static, fuentes, imágenes): CacheFirst.
 *  - Resto: hereda `defaultCache` de Serwist.
 */
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const SUPABASE_HOST = /\.supabase\.co$/;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // API de Supabase: network-first, TTL corto, pocas entradas.
    {
      matcher: ({ url }) => SUPABASE_HOST.test(url.hostname),
      handler: new NetworkFirst({
        cacheName: "supabase-api",
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 60, // 1 minuto: sólo respaldo puntual sin red.
          }),
        ],
      }),
    },
    // Navegaciones (HTML): network-first para arrancar offline.
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 }),
        ],
      }),
    },
    // Estáticos inmutables de Next: cache-first.
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 128,
            maxAgeSeconds: 60 * 60 * 24 * 365,
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
