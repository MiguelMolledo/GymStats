/**
 * Verificación de la Fase 6 (PWA + pulido).
 *
 * Requiere el servidor de producción corriendo (npm run start) en $BASE_URL
 * (por defecto http://localhost:3199). Comprueba:
 *   1. /manifest.webmanifest devuelve el JSON correcto (name, display, iconos…).
 *   2. /sw.js se sirve como JavaScript y no está vacío.
 *   3. Los iconos PNG existen, pesan >0 y tienen las dimensiones correctas
 *      (validado con sharp).
 *   4. Una navegación autenticada normal (usuario test) sigue funcionando:
 *      login vía Supabase → cookies @supabase/ssr → GET / con esas cookies
 *      devuelve 200 con el HTML del dashboard (no redirige a /login).
 *
 * Uso: BASE_URL=http://localhost:3199 npx tsx scripts/verify-phase6.ts
 */
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import sharp from "sharp";

import type { Database } from "../src/lib/supabase/database.types";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3199";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const DOMAIN = "gymstats.app";
const PUBLIC = path.resolve(process.cwd(), "public");

let failed = false;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`❌ ${msg}`);
    failed = true;
  } else {
    console.log(`✓ ${msg}`);
  }
}

/** 1-2-3. Endpoints PWA e iconos. */
async function verifyPwaAssets() {
  console.log("\n— Assets PWA —");

  const mRes = await fetch(`${BASE_URL}/manifest.webmanifest`);
  assert(mRes.ok, `/manifest.webmanifest responde 200 (${mRes.status})`);
  assert(
    (mRes.headers.get("content-type") ?? "").includes("manifest"),
    "manifest se sirve con content-type de manifest",
  );
  const manifest = await mRes.json();
  assert(manifest.name === "GymStats", 'manifest.name === "GymStats"');
  assert(manifest.short_name === "GymStats", 'manifest.short_name === "GymStats"');
  assert(manifest.display === "standalone", "manifest.display === standalone");
  assert(manifest.start_url === "/", "manifest.start_url === /");
  assert(manifest.theme_color === "#030303", "manifest.theme_color === #030303");
  assert(manifest.background_color === "#030303", "manifest.background_color === #030303");
  assert(manifest.lang === "es", "manifest.lang === es");
  assert(Array.isArray(manifest.icons) && manifest.icons.length >= 3, "manifest tiene >=3 iconos");
  assert(
    manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable"),
    "manifest tiene un icono maskable",
  );

  const swRes = await fetch(`${BASE_URL}/sw.js`);
  assert(swRes.ok, `/sw.js responde 200 (${swRes.status})`);
  assert(
    (swRes.headers.get("content-type") ?? "").includes("javascript"),
    "/sw.js se sirve como javascript",
  );
  const swBody = await swRes.text();
  assert(swBody.length > 1000, `/sw.js no está vacío (${swBody.length} bytes)`);

  const expected: Record<string, [number, number]> = {
    "icons/icon-192.png": [192, 192],
    "icons/icon-512.png": [512, 512],
    "icons/maskable-512.png": [512, 512],
    "apple-touch-icon.png": [180, 180],
  };
  for (const [rel, [w, h]] of Object.entries(expected)) {
    // Existe y pesa >0 vía HTTP.
    const res = await fetch(`${BASE_URL}/${rel}`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert(res.ok && buf.length > 0, `/${rel} responde y pesa >0 (${buf.length} bytes)`);
    // Dimensiones vía sharp (desde el fichero en disco).
    const meta = await sharp(path.join(PUBLIC, rel)).metadata();
    assert(
      meta.width === w && meta.height === h,
      `/${rel} mide ${w}x${h} (real: ${meta.width}x${meta.height})`,
    );
  }
}

/** 4. Navegación autenticada real a través del servidor. */
async function verifyAuthenticatedNavigation() {
  console.log("\n— Navegación autenticada —");

  // Recogemos las cookies que @supabase/ssr generaría para la sesión de `test`.
  const jar = new Map<string, string>();
  const supabase = createServerClient<Database>(URL, ANON, {
    cookies: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookies: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookies) jar.set(name, value);
      },
    },
  });

  let signedIn = false;
  for (const email of [`test@${DOMAIN}`, "test@gymstats.local"]) {
    const r = await supabase.auth.signInWithPassword({ email, password: "test1234" });
    if (!r.error && r.data.session) {
      signedIn = true;
      break;
    }
  }
  assert(signedIn, "login de `test` correcto (Supabase)");
  assert(jar.size > 0, `@supabase/ssr generó cookies de sesión (${jar.size})`);

  const cookieHeader = [...jar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  // GET / autenticado: debe devolver 200 y el HTML del dashboard (sin redirigir).
  const res = await fetch(`${BASE_URL}/`, {
    headers: { cookie: cookieHeader },
    redirect: "manual",
  });
  assert(res.status === 200, `GET / autenticado devuelve 200 (${res.status}, no redirige a /login)`);
  const html = await res.text();
  assert(
    html.includes("Inicio") || html.includes("Hola,") || html.includes("resumen"),
    "el HTML de / contiene el dashboard de Inicio",
  );
  assert(
    html.includes("manifest.webmanifest"),
    "el HTML enlaza el manifest de la PWA",
  );

  // Sanidad: sin cookies, / redirige a /login (proxy protege la ruta).
  const anonRes = await fetch(`${BASE_URL}/`, { redirect: "manual" });
  assert(
    anonRes.status >= 300 && anonRes.status < 400,
    `GET / anónimo redirige (${anonRes.status})`,
  );

  await supabase.auth.signOut();
}

async function main() {
  console.log(`Verificando contra ${BASE_URL}`);
  await verifyPwaAssets();
  await verifyAuthenticatedNavigation();

  if (failed) {
    console.error("\n❌ Fase 6: hay comprobaciones fallidas.");
    process.exit(1);
  }
  console.log("\n✅ Fase 6: todas las comprobaciones OK.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
