/**
 * Verificación de la Fase 3 (BILBO dashboard + ciclos + cierre).
 *
 * - Inicia sesión como el usuario `test` (anon key, RLS activa).
 * - Siembra 4 sesiones completed con serie 1 del core (pesos crecientes,
 *   reps decrecientes hasta zona de cierre).
 * - Replica las queries del server component (loadBilboDashboardData /
 *   loadBilboCyclesData) y comprueba puntos/métricas esperadas.
 * - Cierra el ciclo con la MISMA lógica de la server action (closingData) y
 *   verifica status/max_weight/closing_reps en DB.
 * - Limpia TODO con la service role key al terminar.
 *
 * Uso: npx tsx scripts/verify-phase3.ts
 */
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";
import {
  loadBilboDashboardData,
  loadBilboCyclesData,
} from "../src/plugins/bilbo/data";
import {
  cyclePoints,
  cycleStats,
  isInCloseZone,
  closingData,
} from "../src/plugins/bilbo/progression";
import { parseBilboConfig } from "../src/plugins/bilbo/config";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEST_EMAIL = "test@gymstats.local";
const TEST_USERNAME = "test";
const TEST_PASSWORD = "test1234";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`❌ ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`✓ ${msg}`);
}

async function main() {
  const anon = createClient<Database>(URL, ANON);
  const admin = createClient<Database>(URL, SERVICE, {
    auth: { persistSession: false },
  });

  // --- Login como `test` --------------------------------------------------
  // El auth de la app usa username; el email interno se deriva. Probamos con
  // el email convencional y, si falla, buscamos el email real vía service key.
  let userId: string | null = null;
  let signIn = await anon.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signIn.error) {
    const { data: list } = await admin.auth.admin.listUsers();
    const u = list?.users.find(
      (x) =>
        x.email?.startsWith(`${TEST_USERNAME}@`) ||
        (x.user_metadata as { username?: string } | null)?.username ===
          TEST_USERNAME,
    );
    if (u?.email) {
      signIn = await anon.auth.signInWithPassword({
        email: u.email,
        password: TEST_PASSWORD,
      });
    }
  }
  if (signIn.error || !signIn.data.user) {
    // Fallback: buscar por profile.username y usar el email del auth user.
    const { data: prof } = await admin
      .from("profiles")
      .select("id, username")
      .eq("username", TEST_USERNAME)
      .maybeSingle();
    if (prof) {
      const { data: authUser } = await admin.auth.admin.getUserById(prof.id);
      if (authUser.user?.email) {
        signIn = await anon.auth.signInWithPassword({
          email: authUser.user.email,
          password: TEST_PASSWORD,
        });
      }
    }
  }
  assert(!signIn.error && signIn.data.user, "login como `test` (anon)");
  userId = signIn.data.user!.id;

  // --- Contexto: plantilla activa, bloque y core --------------------------
  const { data: profile } = await anon
    .from("profiles")
    .select("active_template_id")
    .eq("id", userId)
    .single();
  const templateId = profile?.active_template_id;
  assert(!!templateId, "profile tiene plantilla activa");

  const { data: template } = await anon
    .from("workout_templates")
    .select("plugin_key, config")
    .eq("id", templateId!)
    .single();
  assert(template?.plugin_key === "bilbo", "plantilla activa es BILBO");
  const config = parseBilboConfig(template!.config);

  const { data: blocks } = await anon
    .from("template_blocks")
    .select("id, slug, label")
    .eq("template_id", templateId!)
    .order("position");
  const block = blocks![0];
  const { data: coreEx } = await anon
    .from("template_exercises")
    .select("id, name, is_core")
    .eq("block_id", block.id)
    .eq("is_core", true)
    .maybeSingle();
  assert(!!coreEx, `bloque "${block.label}" tiene core "${coreEx?.name}"`);

  // --- IDs para poder limpiar exactamente lo que sembremos ----------------
  const createdSessionIds: string[] = [];
  let createdCycleId: string | null = null;

  async function cleanup() {
    // Borra sets, sesiones y ciclos creados (service key, sin RLS).
    for (const sid of createdSessionIds) {
      await admin.from("session_sets").delete().eq("session_id", sid);
    }
    if (createdSessionIds.length > 0) {
      await admin.from("workout_sessions").delete().in("id", createdSessionIds);
    }
    // Cualquier ciclo del usuario en este bloque creado durante la prueba.
    await admin
      .from("cycles")
      .delete()
      .eq("user_id", userId!)
      .eq("block_id", block.id);
  }

  try {
    // Limpieza previa por si una ejecución anterior falló a medias.
    await admin.from("cycles").delete().eq("user_id", userId!).eq("block_id", block.id);

    // --- Siembra: 4 sesiones (peso ↑, reps ↓ hasta ≤ floor) ---------------
    const plan = [
      { day: "2026-06-01", weight: 100, reps: 32 },
      { day: "2026-06-08", weight: 105, reps: 26 },
      { day: "2026-06-15", weight: 112, reps: 18 },
      { day: "2026-06-22", weight: 118, reps: 11 }, // ≤ floor (12) → zona cierre
    ];

    for (const [i, p] of plan.entries()) {
      const sessionId = crypto.randomUUID();
      createdSessionIds.push(sessionId);
      const startedAt = `${p.day}T1${i}:00:00.000Z`;
      const { error: sErr } = await anon.from("workout_sessions").insert({
        id: sessionId,
        user_id: userId!,
        template_id: templateId!,
        block_id: block.id,
        performed_on: p.day,
        started_at: startedAt,
        completed_at: startedAt,
        status: "completed",
      });
      assert(!sErr, `insert sesión ${i + 1} (${p.day})${sErr ? ": " + sErr.message : ""}`);

      const { error: setErr } = await anon.from("session_sets").insert({
        id: crypto.randomUUID(),
        session_id: sessionId,
        exercise_id: coreEx!.id,
        set_number: 1,
        weight: p.weight,
        reps: p.reps,
      });
      assert(!setErr, `insert set S1 sesión ${i + 1}${setErr ? ": " + setErr.message : ""}`);
    }

    // --- Crea el ciclo activo (como haría onSessionCompleted) -------------
    createdCycleId = crypto.randomUUID();
    const { error: cErr } = await anon.from("cycles").insert({
      id: createdCycleId,
      user_id: userId!,
      template_id: templateId!,
      block_id: block.id,
      exercise_id: coreEx!.id,
      status: "active",
      started_at: "2026-06-01T00:00:00.000Z",
      start_weight: 100,
      max_weight: 118,
    });
    assert(!cErr, `insert ciclo activo${cErr ? ": " + cErr.message : ""}`);

    // --- Replica loaders del server component -----------------------------
    const dash = await loadBilboDashboardData(anon, userId!, templateId!);
    assert(!!dash, "loadBilboDashboardData devuelve datos");
    const bd = dash!.blocks.find((b) => b.block.id === block.id)!;
    assert(!!bd.cycle && bd.cycle.status === "active", "dashboard: ciclo activo del bloque");

    const points = cyclePoints(bd.rows, {
      started_at: bd.cycle!.started_at,
      ended_at: bd.cycle!.ended_at,
      status: bd.cycle!.status,
    });
    assert(points.length === 4, `dashboard: 4 puntos en el ciclo (got ${points.length})`);
    assert(
      points.map((p) => p.weight).join(",") === "100,105,112,118",
      "dashboard: pesos ordenados 100,105,112,118",
    );

    const stats = cycleStats(points);
    assert(stats.start?.weight === 100, "dashboard: start = 100kg");
    assert(stats.best?.weight === 118, "dashboard: best = 118kg");
    assert(stats.latest?.reps === 11, "dashboard: latest = 11 reps");
    assert(isInCloseZone(stats.latest, config), "dashboard: en zona de cierre (≤ floor)");

    // --- Vista Ciclos -----------------------------------------------------
    const cyc = await loadBilboCyclesData(anon, userId!, templateId!);
    assert(!!cyc, "loadBilboCyclesData devuelve datos");
    const thisCycle = cyc!.cycles.find((c) => c.id === createdCycleId);
    assert(!!thisCycle, "ciclos: el ciclo sembrado aparece en la lista");
    const cycRows = cyc!.rowsByBlock[block.id] ?? [];
    const cycPoints = cyclePoints(cycRows, {
      started_at: thisCycle!.started_at,
      ended_at: thisCycle!.ended_at,
      status: thisCycle!.status,
    });
    assert(cycPoints.length === 4, "ciclos: 4 puntos");

    // --- Cierre de ciclo (misma lógica que la server action) --------------
    const closing = closingData(points);
    assert(closing?.max_weight === 118, "closingData.max_weight === 118");
    assert(closing?.closing_reps === 11, "closingData.closing_reps === 11");

    const { error: closeErr } = await anon
      .from("cycles")
      .update({
        status: "closed",
        ended_at: new Date().toISOString(),
        max_weight: closing!.max_weight,
        closing_reps: closing!.closing_reps,
      })
      .eq("id", createdCycleId!)
      .eq("user_id", userId!);
    assert(!closeErr, `cierre del ciclo (anon, RLS)${closeErr ? ": " + closeErr.message : ""}`);

    // --- Verifica en DB ---------------------------------------------------
    const { data: closed } = await anon
      .from("cycles")
      .select("status, ended_at, max_weight, closing_reps")
      .eq("id", createdCycleId!)
      .single();
    assert(closed?.status === "closed", "DB: status = closed");
    assert(!!closed?.ended_at, "DB: ended_at seteado");
    assert(closed?.max_weight === 118, "DB: max_weight = 118");
    assert(closed?.closing_reps === 11, "DB: closing_reps = 11");

    console.log("\n✅ Verificación Fase 3 OK");
  } finally {
    await cleanup();
    console.log("🧹 Limpieza completada");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
