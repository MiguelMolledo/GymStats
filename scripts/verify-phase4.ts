/**
 * Verificación de la Fase 4 (Historial: vista de sesiones por mes).
 *
 * - Inicia sesión como el usuario `test` (anon key, RLS activa).
 * - Siembra 3 sesiones completed en 2 meses distintos, con sets variados:
 *   nota de sesión, nota de set y un ejercicio no-core.
 * - Replica las queries del server component (loadMonthSessions / summarize)
 *   y comprueba: filtrado por mes, orden desc, agrupación por ejercicio en
 *   orden de position, contadores por bloque.
 * - Limpia TODO con la service role key al terminar (0 filas restantes).
 *
 * Uso: npx tsx scripts/verify-phase4.ts
 */
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";
import { loadMonthSessions, summarize } from "../src/app/(app)/historial/data";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

  // --- Login como `test` (deriva el email real vía service key) ------------
  let userId: string | null = null;
  let signIn = await anon.auth.signInWithPassword({
    email: `${TEST_USERNAME}@gymstats.local`,
    password: TEST_PASSWORD,
  });
  if (signIn.error) {
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

  // --- Contexto: plantilla activa, dos bloques, ejercicios -----------------
  const { data: profile } = await anon
    .from("profiles")
    .select("active_template_id")
    .eq("id", userId)
    .single();
  const templateId = profile?.active_template_id;
  assert(!!templateId, "profile tiene plantilla activa");

  const { data: blocks } = await anon
    .from("template_blocks")
    .select("id, slug, label")
    .eq("template_id", templateId!)
    .order("position");
  assert((blocks?.length ?? 0) >= 2, "plantilla tiene al menos 2 bloques");
  const blockA = blocks![0];
  const blockB = blocks![1];

  // Ejercicios del bloque A: core (position menor) + otro no-core.
  const { data: exA } = await anon
    .from("template_exercises")
    .select("id, name, is_core, position")
    .eq("block_id", blockA.id)
    .eq("archived", false)
    .order("position");
  const coreA = exA?.find((e) => e.is_core);
  const nonCoreA = exA?.find((e) => !e.is_core);
  assert(!!coreA, `bloque A "${blockA.label}" tiene core "${coreA?.name}"`);
  assert(!!nonCoreA, `bloque A tiene un ejercicio no-core "${nonCoreA?.name}"`);

  const { data: exB } = await anon
    .from("template_exercises")
    .select("id, name, is_core, position")
    .eq("block_id", blockB.id)
    .eq("archived", false)
    .order("position");
  const coreB = exB?.find((e) => e.is_core) ?? exB?.[0];
  assert(!!coreB, `bloque B "${blockB.label}" tiene ejercicios`);

  const createdSessionIds: string[] = [];

  async function cleanup() {
    for (const sid of createdSessionIds) {
      await admin.from("session_sets").delete().eq("session_id", sid);
    }
    if (createdSessionIds.length > 0) {
      await admin.from("workout_sessions").delete().in("id", createdSessionIds);
    }
  }

  async function seedSession(opts: {
    day: string;
    blockId: string;
    notes: string;
    sets: {
      exercise_id: string;
      set_number: number;
      weight: number;
      reps: number;
      notes?: string;
    }[];
    startedAt: string;
  }) {
    const sessionId = crypto.randomUUID();
    createdSessionIds.push(sessionId);
    const { error: sErr } = await anon.from("workout_sessions").insert({
      id: sessionId,
      user_id: userId!,
      template_id: templateId!,
      block_id: opts.blockId,
      performed_on: opts.day,
      started_at: opts.startedAt,
      completed_at: opts.startedAt,
      notes: opts.notes,
      status: "completed",
    });
    assert(!sErr, `insert sesión ${opts.day}${sErr ? ": " + sErr.message : ""}`);
    for (const s of opts.sets) {
      const { error: setErr } = await anon.from("session_sets").insert({
        id: crypto.randomUUID(),
        session_id: sessionId,
        exercise_id: s.exercise_id,
        set_number: s.set_number,
        weight: s.weight,
        reps: s.reps,
        notes: s.notes ?? "",
      });
      assert(!setErr, `insert set ${opts.day} #${s.set_number}${setErr ? ": " + setErr.message : ""}`);
    }
    return sessionId;
  }

  try {
    // Limpieza previa por si una ejecución anterior falló a medias.
    await admin
      .from("workout_sessions")
      .delete()
      .eq("user_id", userId!)
      .in("performed_on", ["2025-03-05", "2025-03-20", "2025-04-12"]);

    // --- Siembra --------------------------------------------------------
    // Junio... usamos marzo/abril 2025 (fechas fijas fuera del mes actual).
    // Mes 1 (marzo 2025): 2 sesiones (bloque A y bloque B).
    // Sesión A: nota de sesión + set no-core con nota de set. Sets desordenados
    // para verificar orden por set_number, y ejercicios para orden por position.
    await seedSession({
      day: "2025-03-20", // más reciente del mes → debe ir primera
      blockId: blockA.id,
      notes: "Buen día, subí peso",
      startedAt: "2025-03-20T10:00:00.000Z",
      sets: [
        // no-core primero en el array, position mayor → debe quedar 2º
        { exercise_id: nonCoreA!.id, set_number: 1, weight: 20, reps: 12, notes: "flojo" },
        // core, sets en orden inverso → deben ordenarse 1,2
        { exercise_id: coreA!.id, set_number: 2, weight: 82.5, reps: 8 },
        { exercise_id: coreA!.id, set_number: 1, weight: 80, reps: 10, notes: "top set" },
      ],
    });
    await seedSession({
      day: "2025-03-05",
      blockId: blockB.id,
      notes: "",
      startedAt: "2025-03-05T10:00:00.000Z",
      sets: [{ exercise_id: coreB!.id, set_number: 1, weight: 100, reps: 15 }],
    });

    // Mes 2 (abril 2025): 1 sesión bloque A.
    await seedSession({
      day: "2025-04-12",
      blockId: blockA.id,
      notes: "",
      startedAt: "2025-04-12T10:00:00.000Z",
      sets: [{ exercise_id: coreA!.id, set_number: 1, weight: 85, reps: 9 }],
    });

    // --- Replica el server component: MARZO 2025 ------------------------
    const march = await loadMonthSessions(anon, userId!, 2025, 3);
    assert(march.length === 2, `marzo: 2 sesiones (got ${march.length})`);
    // Orden desc por performed_on: 03-20 antes que 03-05.
    assert(
      march[0].performed_on === "2025-03-20" && march[1].performed_on === "2025-03-05",
      "marzo: orden descendente por fecha",
    );

    const s1 = march[0];
    assert(s1.notes === "Buen día, subí peso", "marzo: nota de sesión presente");
    assert(s1.block.id === blockA.id, "marzo: bloque A en la 1ª sesión");
    // Agrupación por ejercicio en orden de position: core (pos menor) primero.
    assert(
      s1.exercises.length === 2,
      `marzo s1: 2 ejercicios (got ${s1.exercises.length})`,
    );
    assert(
      s1.exercises[0].position < s1.exercises[1].position,
      "marzo s1: ejercicios en orden de position",
    );
    assert(s1.exercises[0].is_core === true, "marzo s1: primer ejercicio es core");
    assert(s1.exercises[1].is_core === false, "marzo s1: segundo ejercicio no-core");
    // Sets del core ordenados por set_number.
    assert(
      s1.exercises[0].sets.map((x) => x.set_number).join(",") === "1,2",
      "marzo s1: sets del core ordenados 1,2",
    );
    assert(s1.exercises[0].sets[0].notes === "top set", "marzo s1: nota de set en core S1");
    assert(s1.exercises[0].sets[0].weight === 80, "marzo s1: core S1 = 80kg");
    assert(s1.exercises[0].sets[1].weight === 82.5, "marzo s1: core S2 = 82.5kg (decimal)");
    assert(s1.exercises[1].sets[0].notes === "flojo", "marzo s1: nota de set en no-core");

    // Resumen del mes: total + contador por bloque.
    const marchSummary = summarize(march);
    assert(marchSummary.total === 2, "marzo resumen: total 2");
    assert(marchSummary.blocks.length === 2, "marzo resumen: 2 bloques distintos");
    const cA = marchSummary.blocks.find((b) => b.id === blockA.id);
    const cB = marchSummary.blocks.find((b) => b.id === blockB.id);
    assert(cA?.count === 1 && cB?.count === 1, "marzo resumen: 1 sesión por bloque");

    // --- ABRIL 2025: filtrado por mes correcto --------------------------
    const april = await loadMonthSessions(anon, userId!, 2025, 4);
    assert(april.length === 1, `abril: 1 sesión (got ${april.length})`);
    assert(april[0].performed_on === "2025-04-12", "abril: sesión correcta");
    const aprilSummary = summarize(april);
    assert(aprilSummary.total === 1, "abril resumen: total 1");
    assert(
      aprilSummary.blocks.length === 1 && aprilSummary.blocks[0].id === blockA.id,
      "abril resumen: solo bloque A",
    );

    // --- MAYO 2025: mes vacío -------------------------------------------
    const may = await loadMonthSessions(anon, userId!, 2025, 5);
    assert(may.length === 0, "mayo: sin sesiones (mes vacío)");

    console.log("\n✅ Verificación Fase 4 OK");
  } finally {
    await cleanup();
    // Comprobación de limpieza: 0 filas restantes de lo sembrado.
    const { data: leftSessions } = await admin
      .from("workout_sessions")
      .select("id")
      .in("id", createdSessionIds);
    const { count: leftSets } = await admin
      .from("session_sets")
      .select("id", { count: "exact", head: true })
      .in("session_id", createdSessionIds);
    assert((leftSessions?.length ?? 0) === 0, "limpieza: 0 sesiones restantes");
    assert((leftSets ?? 0) === 0, "limpieza: 0 sets restantes");
    console.log("🧹 Limpieza completada");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
