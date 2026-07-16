# GymStats

PWA para registrar entrenamientos de gimnasio y seguir tu progresión. Diseño
oscuro (#030303 con glows), mobile-first e **instalable** en el móvil. La sesión
de entreno funciona **offline** (local-first con Dexie + motor de sincronización).

Incluye la metodología **BILBO** como plugin de entrenamiento de ejemplo
(ciclos de progresión, high-scores por bloque, dashboard con gráficas).

---

## Stack

- **Next.js 16** (App Router, React 19, Server Components + Server Actions)
- **TypeScript** estricto
- **Tailwind CSS 4**
- **Supabase** (Postgres + Auth + RLS) — auth por **usuario + contraseña**
  (sin email real: el username se traduce a un email sintético `<user>@gymstats.app`)
- **Dexie** (IndexedDB) + motor de sync propio para la sesión activa local-first
- **Zustand** para el estado de la sesión en curso
- **Recharts** para las gráficas de progresión
- **Serwist** (`@serwist/next`) para el service worker / PWA
- **Vitest** para los tests de lógica pura
- **sharp** (devDep) para generar los iconos de la PWA

---

## Estructura

```
src/
  app/
    (auth)/            Login y registro (server actions en actions.ts)
    (app)/             Zona autenticada (layout con GlowBackground + BottomNav)
      page.tsx         Inicio: dashboard del plugin activo
      entrenar/        Sesión de entreno (local-first, Dexie + sync)
      historial/       Historial mensual de sesiones
      plantillas/      Lista de plantillas + editor por plantilla ([id])
      v/[slug]/        Vistas extra que aportan los plugins (p. ej. Ciclos)
      loading.tsx      Skeletons oscuros por vista
    manifest.ts        Manifest de la PWA (/manifest.webmanifest)
    sw.ts              Service worker (compilado por Serwist a /public/sw.js)
    layout.tsx         Layout raíz: metadatos PWA/iOS + registro del SW
  components/          Header, BottomNav, GlowBackground, Skeleton, ...
  features/
    active-session/    Motor local-first: db (Dexie), store, sync, lógica
  lib/
    auth/              Constantes de auth (username → email sintético)
    supabase/          Clientes server/client + tipos generados
  plugins/
    types.ts           Interfaz WorkoutPlugin (contrato de un plugin)
    registry.ts        Registro de plugins + config por defecto
    bilbo/             Plugin BILBO (Dashboard, ExtraViews, ciclos, ...)
  proxy.ts             Proxy (antes middleware): refresca sesión y protege rutas
scripts/               migrate-aikit, generate-icons, verify-phase*
supabase/              Migraciones, seed y config de la CLI
```

---

## Variables de entorno

Copia `.env.example` a `.env.local` y rellena los valores (Supabase → Settings → API):

```bash
cp .env.example .env.local
```

| Variable | Uso | ¿Cliente? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | Sí (pública) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima | Sí (pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role (bypassa RLS) — **solo para scripts** | No (secreta) |
| `SUPABASE_DB_PASSWORD` | Password de la BD para la CLI de Supabase | No |
| `INVITE_CODE` | Código de invitación exigido al registrarse (validado server-side) | No |

---

## Desarrollo local

```bash
npm install
npm run dev            # http://localhost:3000 (Turbopack)
```

Otros scripts:

```bash
npm run build          # build de producción (usa --webpack, ver PWA)
npm run start          # sirve el build de producción
npm run test           # tests con Vitest (lógica pura)
```

> **Nota PWA:** el service worker está **deshabilitado en `dev`** (interferiría
> con el hot-reload). Para probar la PWA de verdad haz `npm run build && npm run start`.

---

## Base de datos (Supabase)

### Migraciones (`db push`)

Las migraciones viven en `supabase/migrations/`. Para aplicarlas al proyecto remoto:

```bash
# 1. Enlaza el proyecto (una vez). REF = vwfesurfvemlfkhmiiuq
supabase link --project-ref <REF>

# 2. Aplica las migraciones pendientes al remoto
supabase db push
```

En local con la CLI (`supabase start`), `supabase db reset` aplica migraciones **y** el seed.

### Seed

`supabase/seed.sql` crea la plantilla del **sistema BILBO** (bloques + ejercicios).
Es idempotente (UUIDs fijos + `ON CONFLICT DO NOTHING`) y `created_by = NULL`
(plantilla del sistema, protegida por RLS).

`supabase db push` **no** ejecuta el seed contra el remoto. Para aplicarlo al remoto:

```bash
psql "postgresql://postgres.<REF>:<DB_PASSWORD_URLENCODED>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres" \
     -f supabase/seed.sql
```

### Importación desde AiKit

Migra los datos del tracker antiguo (SQLite exportado de la app *aikit*) al esquema de GymStats:

```bash
# Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local y que el profile destino exista.
npx tsx scripts/migrate-aikit.ts [ruta-al-sqlite] [--dry-run]
```

Es idempotente: los UUID de sessions/sets/cycles se derivan por UUIDv5, así que
re-ejecutarlo no duplica. `--dry-run` valida los mapeos sin escribir nada.

---

## Cómo añadir un nuevo plugin de entrenamiento

Un plugin encapsula la lógica de dominio de una metodología (progresión, ciclos,
widgets propios, vistas extra). El contrato está en `src/plugins/types.ts`
(`interface WorkoutPlugin`). Pasos:

1. **Crea la carpeta** `src/plugins/<key>/` (p. ej. `src/plugins/531/`).

2. **Config**: define y parsea la config específica del plugin. Cada plugin
   refina el tipo de su `config` (jsonb de la plantilla):

   ```ts
   // src/plugins/531/config.ts
   export const FIVE31_DEFAULTS = { tm_percent: 90 };
   export function parse531Config(raw: unknown) {
     const c = (raw ?? {}) as Record<string, unknown>;
     return { tm_percent: Number(c.tm_percent ?? 90) };
   }
   ```

3. **Dashboard** (obligatorio): componente que se pinta en Inicio. Recibe
   `data` ya cargada por el server component (debe ser serializable):

   ```tsx
   // src/plugins/531/Dashboard.tsx
   import type { DashboardProps } from "../types";
   export function FiveThreeOneDashboard({ data }: DashboardProps) { /* ... */ }
   ```

4. **Opcionales**, según necesites:
   - `SessionExtras`: widget dentro del formulario de la sesión de entreno.
   - `onSessionCompleted(ctx)`: hook al cerrar una sesión (crear/actualizar
     ciclos, high-scores…). Recibe `supabase`, `session`, `sets`, `config`,
     `template`, `blocks`, `exercises`.
   - `ExtraViews`: vistas extra que aparecen en la BottomNav y se sirven en
     `/v/{slug}`. `icon` es el **nombre** de un icono lucide (string
     serializable); si usas uno nuevo, regístralo en `EXTRA_ICONS` dentro de
     `src/components/BottomNav.tsx`.

5. **Ensambla el plugin** implementando `WorkoutPlugin`:

   ```ts
   // src/plugins/531/index.ts
   import type { WorkoutPlugin } from "../types";
   export const fiveThreeOnePlugin: WorkoutPlugin = {
     key: "531",
     name: "5/3/1",
     parseConfig: parse531Config,
     Dashboard: FiveThreeOneDashboard,
     // SessionExtras, onSessionCompleted, ExtraViews... opcionales
   };
   ```

6. **Regístralo** en `src/plugins/registry.ts` (mapa `PLUGINS` y config por
   defecto en `DEFAULT_CONFIG`). A partir de ahí aparecerá en el selector al
   crear plantillas y el shell resolverá su Dashboard/ExtraViews automáticamente.

7. Si `/v/[slug]` necesita cargar datos propios del plugin, añade la carga en
   `src/app/(app)/v/[slug]/page.tsx` (hoy hay una rama por `plugin_key`).

> **Recomendación:** deja la lógica pura (progresión, cálculos) en ficheros
> `*.ts` testeables con Vitest, como hace `plugins/bilbo/progression.ts`.

---

## PWA / Service Worker

- **Serwist** genera el service worker desde `src/app/sw.ts` a `public/sw.js`
  (precache del shell + runtime caching). Ver `next.config.ts`.
- Estrategias de caché: **network-first** para navegaciones y para la API de
  Supabase (con expiración muy corta, porque son datos personales con auth),
  **cache-first** para estáticos inmutables de Next.
- **Decisión de bundler:** `@serwist/next` usa un plugin de **webpack**
  (`InjectManifest`), incompatible con Turbopack. Por eso `build` usa
  `next build --webpack` mientras que `dev` sigue con Turbopack (y el SW
  deshabilitado). `@serwist/turbopack` existe pero aún es experimental.
- **Iconos:** se generan por código con `sharp`:

  ```bash
  npx tsx scripts/generate-icons.ts
  ```

  Produce `public/icons/{icon-192,icon-512,maskable-512}.png`,
  `public/apple-touch-icon.png` y `public/favicon.ico`.

---

## Deploy en Vercel

1. Importa el repo en Vercel. El build command estándar (`npm run build`) ya
   usa `--webpack` (necesario para Serwist); no hay que cambiarlo.
2. Configura las variables de entorno del proyecto:

   | Variable | Obligatoria | Notas |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Sí | |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | |
   | `INVITE_CODE` | Sí | Sin él nadie puede registrarse |
   | `SUPABASE_SERVICE_ROLE_KEY` | Opcional | Solo si ejecutas scripts (migración/verificación); **no** la use el runtime |

3. Deploy. El service worker se registra automáticamente en producción
   (`src/components/ServiceWorker.tsx`).

> La instalabilidad real en iOS (añadir a pantalla de inicio, modo standalone,
> status bar translúcida) solo se puede verificar en un dispositivo real.
