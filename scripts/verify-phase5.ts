/**
 * Verificación de la Fase 5 (Plantillas: editor + flujo multi-usuario).
 *
 * Flujo multi-usuario real, todo con RLS activa (anon key) salvo la limpieza:
 *  1. Registra `test2` (signUp anon con metadata username/display_name).
 *  2. Con `test2`: duplica BILBO (server action duplicateTemplate), renombra,
 *     añade un bloque nuevo con 2 ejercicios (1 core), activa su plantilla.
 *  3. Registra una sesión completed con sets (inserts anon) sobre su bloque.
 *  4. Verifica:
 *     - Su dashboard-data (loadBilboDashboardData) sale de SU plantilla.
 *     - `test` NO ve las sesiones de `test2` (RLS).
 *     - El chip ACTIVA de `test2` apunta a su plantilla (loadTemplates).
 *     - Las queries de Entrenar de `test` siguen mostrando BILBO (sistema).
 *  5. Pruebas del editor: swap de core (setCore), archivado de ejercicio con
 *     registros vs delete sin registros.
 *  6. LIMPIA: sesión/sets/ciclos de test2, su plantilla y el usuario test2
 *     (admin API service key). Deja a `test` como estaba (BILBO activa).
 *
 * Nota: las server actions usan cookies() de Next → no se pueden invocar aquí.
 * Este script replica su LÓGICA con el cliente anon del usuario (misma RLS),
 * y usa los loaders puros (data.ts) que sí son reutilizables.
 *
 * Uso: npx tsx scripts/verify-phase5.ts
 */
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";
import { loadTemplates, loadEditorTemplate } from "../src/app/(app)/plantillas/data";
import { loadBilboDashboardData } from "../src/plugins/bilbo/data";
import { uniqueSlug } from "../src/app/(app)/plantillas/logic";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const INVITE = process.env.INVITE_CODE!;

const BILBO_ID = "11111111-1111-4111-8111-111111111111";
const TEST2 = "test2";
const TEST2_PASS = "test1234";
const DOMAIN = "gymstats.app";

type Client = SupabaseClient<Database, "gymstats">;

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`❌ ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`✓ ${msg}`);
}

async function loginTest(anon: Client, admin: Client): Promise<string> {
  // `test` puede haberse creado con dominio .local o .app; probamos ambos.
  for (const email of [`test@${DOMAIN}`, "test@gymstats.local"]) {
    const r = await anon.auth.signInWithPassword({ email, password: "test1234" });
    if (!r.error && r.data.user) return r.data.user.id;
  }
  const { data: prof } = await admin
    .from("profiles")
    .select("id")
    .eq("username", "test")
    .maybeSingle();
  if (prof) {
    const { data: authUser } = await admin.auth.admin.getUserById(prof.id);
    if (authUser.user?.email) {
      const r = await anon.auth.signInWithPassword({
        email: authUser.user.email,
        password: "test1234",
      });
      if (!r.error && r.data.user) return r.data.user.id;
    }
  }
  throw new Error("no se pudo iniciar sesión como `test`");
}

async function main() {
  const admin = createClient<Database, "gymstats">(URL, SERVICE, {
    db: { schema: "gymstats" },
    auth: { persistSession: false },
  });

  // Cada usuario en su propio cliente (sesiones aisladas).
  const anonTest = createClient<Database, "gymstats">(URL, ANON, {
    db: { schema: "gymstats" },
  });
  const anon2 = createClient<Database, "gymstats">(URL, ANON, {
    db: { schema: "gymstats" },
  });

  // Estado a limpiar.
  let test2Id: string | null = null;
  let test2TemplateId: string | null = null;
  const test2SessionIds: string[] = [];

  async function cleanup() {
    console.log("\n🧹 Limpieza…");
    for (const sid of test2SessionIds) {
      await admin.from("session_sets").delete().eq("session_id", sid);
    }
    if (test2Id) {
      await admin.from("cycles").delete().eq("user_id", test2Id);
      await admin.from("workout_sessions").delete().eq("user_id", test2Id);
      // Poner active_template_id a null antes de borrar la plantilla (FK).
      await admin.from("profiles").update({ active_template_id: null }).eq("id", test2Id);
    }
    if (test2TemplateId) {
      await admin.from("workout_templates").delete().eq("id", test2TemplateId);
    }
    if (test2Id) {
      await admin.auth.admin.deleteUser(test2Id);
    }
  }

  try {
    // Limpieza previa por si una ejecución anterior falló a medias.
    {
      const { data: prev } = await admin
        .from("profiles")
        .select("id")
        .eq("username", TEST2)
        .maybeSingle();
      if (prev) {
        await admin.from("cycles").delete().eq("user_id", prev.id);
        await admin.from("workout_sessions").delete().eq("user_id", prev.id);
        await admin.from("profiles").update({ active_template_id: null }).eq("id", prev.id);
        await admin.from("workout_templates").delete().eq("created_by", prev.id);
        await admin.auth.admin.deleteUser(prev.id);
      }
    }

    // --- 1. Registro de test2 (signUp anon, mismo mecanismo que la página) --
    const signUp = await anon2.auth.signUp({
      email: `${TEST2}@${DOMAIN}`,
      password: TEST2_PASS,
      options: { data: { username: TEST2, display_name: "Test Dos" } },
    });
    assert(!signUp.error && signUp.data.user, `registro de \`${TEST2}\``);
    test2Id = signUp.data.user!.id;

    // Sesión activa para RLS. Si no hay sesión (confirm email), inicia sesión.
    if (!signUp.data.session) {
      const si = await anon2.auth.signInWithPassword({
        email: `${TEST2}@${DOMAIN}`,
        password: TEST2_PASS,
      });
      assert(!si.error && si.data.user, "login de test2");
    }
    // Verifica que el invite code de env está definido (aunque signUp no lo use
    // directamente aquí, es lo que la página valida server-side).
    assert(!!INVITE, "INVITE_CODE definido en env");

    // --- 2a. Duplicar BILBO como test2 (réplica de duplicateTemplate) -------
    const { data: bilbo } = await anon2
      .from("workout_templates")
      .select("name, plugin_key, config")
      .eq("id", BILBO_ID)
      .single();
    assert(!!bilbo, "test2 puede leer la plantilla BILBO (sistema)");

    const { data: dup, error: dupErr } = await anon2
      .from("workout_templates")
      .insert({
        name: `${bilbo!.name} (copia)`,
        plugin_key: bilbo!.plugin_key,
        config: bilbo!.config,
        created_by: test2Id,
      })
      .select("id, name")
      .single();
    assert(!dupErr && dup, `duplicar BILBO${dupErr ? ": " + dupErr.message : ""}`);
    test2TemplateId = dup!.id;
    assert(dup!.name === "BILBO (copia)", "la copia tiene sufijo (copia)");

    // Copiar bloques + ejercicios no archivados.
    const { data: srcBlocks } = await anon2
      .from("template_blocks")
      .select("id, slug, label, emoji, accent_color, position")
      .eq("template_id", BILBO_ID)
      .order("position");
    for (const b of srcBlocks ?? []) {
      const { data: nb } = await anon2
        .from("template_blocks")
        .insert({
          template_id: test2TemplateId!,
          slug: b.slug,
          label: b.label,
          emoji: b.emoji,
          accent_color: b.accent_color,
          position: b.position,
        })
        .select("id")
        .single();
      const { data: srcEx } = await anon2
        .from("template_exercises")
        .select("name, target_sets, is_core, position")
        .eq("block_id", b.id)
        .eq("archived", false)
        .order("position");
      if (nb && srcEx && srcEx.length > 0) {
        await anon2.from("template_exercises").insert(
          srcEx.map((e) => ({
            block_id: nb.id,
            name: e.name,
            target_sets: e.target_sets,
            is_core: e.is_core,
            position: e.position,
          })),
        );
      }
    }

    // --- 2b. Renombrar la copia (réplica de updateTemplate) -----------------
    await anon2
      .from("workout_templates")
      .update({ name: "Mi Rutina" })
      .eq("id", test2TemplateId!);
    const { data: renamed } = await anon2
      .from("workout_templates")
      .select("name")
      .eq("id", test2TemplateId!)
      .single();
    assert(renamed?.name === "Mi Rutina", "renombrar la plantilla propia");

    // --- 2c. Añadir un bloque nuevo con 2 ejercicios (1 core) ---------------
    const { data: existingBlocks } = await anon2
      .from("template_blocks")
      .select("slug, position")
      .eq("template_id", test2TemplateId!);
    const newSlug = uniqueSlug(
      "Hombro",
      (existingBlocks ?? []).map((b) => b.slug),
    );
    const nextPos =
      (existingBlocks ?? []).reduce((m, b) => Math.max(m, b.position), -1) + 1;
    const { data: newBlock, error: nbErr } = await anon2
      .from("template_blocks")
      .insert({
        template_id: test2TemplateId!,
        slug: newSlug,
        label: "Hombro",
        emoji: "🦾",
        accent_color: "#22c55e",
        position: nextPos,
      })
      .select("id")
      .single();
    assert(!nbErr && newBlock, `añadir bloque nuevo${nbErr ? ": " + nbErr.message : ""}`);

    // Ejercicio core (posición 0).
    const { data: coreEx, error: coreErr } = await anon2
      .from("template_exercises")
      .insert({
        block_id: newBlock!.id,
        name: "Press militar",
        target_sets: 3,
        is_core: true,
        position: 0,
      })
      .select("id")
      .single();
    assert(!coreErr && coreEx, `añadir ejercicio core${coreErr ? ": " + coreErr.message : ""}`);
    // Ejercicio no-core (posición 1).
    const { data: exB } = await anon2
      .from("template_exercises")
      .insert({
        block_id: newBlock!.id,
        name: "Elevaciones laterales",
        target_sets: 3,
        is_core: false,
        position: 1,
      })
      .select("id")
      .single();
    assert(!!exB, "añadir segundo ejercicio (no-core)");

    // --- Swap de core: marcar exB como core desmarcando el anterior ---------
    // Réplica de setCore: desmarcar ANTES de marcar (índice único parcial).
    {
      const { error: unsetErr } = await anon2
        .from("template_exercises")
        .update({ is_core: false })
        .eq("block_id", newBlock!.id)
        .eq("is_core", true)
        .eq("archived", false);
      assert(!unsetErr, "swap core: desmarcar core previo");
      const { error: setErr } = await anon2
        .from("template_exercises")
        .update({ is_core: true })
        .eq("id", exB!.id);
      assert(!setErr, `swap core: marcar nuevo core${setErr ? ": " + setErr.message : ""}`);
      const { data: cores } = await anon2
        .from("template_exercises")
        .select("id, is_core")
        .eq("block_id", newBlock!.id)
        .eq("is_core", true)
        .eq("archived", false);
      assert(
        (cores?.length ?? 0) === 1 && cores![0].id === exB!.id,
        "swap core: exactamente 1 core, y es el nuevo",
      );
    }
    // Volvemos a dejar el core original (Press militar) como core para el resto.
    await anon2.from("template_exercises").update({ is_core: false }).eq("id", exB!.id);
    await anon2.from("template_exercises").update({ is_core: true }).eq("id", coreEx!.id);

    // --- 2d. Activar la plantilla de test2 (réplica de useTemplate) ---------
    const { error: actErr } = await anon2
      .from("profiles")
      .update({ active_template_id: test2TemplateId! })
      .eq("id", test2Id!);
    assert(!actErr, "activar plantilla propia");

    // --- 3. Registrar una sesión completed con sets sobre el bloque nuevo ---
    const sessionId = crypto.randomUUID();
    test2SessionIds.push(sessionId);
    const { error: sErr } = await anon2.from("workout_sessions").insert({
      id: sessionId,
      user_id: test2Id!,
      template_id: test2TemplateId!,
      block_id: newBlock!.id,
      performed_on: "2025-06-10",
      started_at: "2025-06-10T10:00:00.000Z",
      completed_at: "2025-06-10T10:30:00.000Z",
      status: "completed",
    });
    assert(!sErr, `insert sesión test2${sErr ? ": " + sErr.message : ""}`);
    const { error: setErr } = await anon2.from("session_sets").insert([
      {
        id: crypto.randomUUID(),
        session_id: sessionId,
        exercise_id: coreEx!.id,
        set_number: 1,
        weight: 40,
        reps: 30,
      },
      {
        id: crypto.randomUUID(),
        session_id: sessionId,
        exercise_id: exB!.id,
        set_number: 1,
        weight: 12,
        reps: 15,
      },
    ]);
    assert(!setErr, `insert sets test2${setErr ? ": " + setErr.message : ""}`);

    // --- 4a. Dashboard-data de test2 sale de SU plantilla -------------------
    const dash = await loadBilboDashboardData(anon2, test2Id!, test2TemplateId!);
    assert(!!dash, "dashboard-data de test2 carga");
    const hombro = dash!.blocks.find((b) => b.block.slug === newSlug);
    assert(!!hombro, "dashboard de test2 incluye SU bloque nuevo (Hombro)");
    assert(
      hombro!.block.core?.name === "Press militar",
      "core del bloque nuevo es Press militar",
    );
    assert(hombro!.rows.length === 1, "dashboard test2: 1 fila de serie 1 del core");
    assert(hombro!.rows[0].weight === 40, "dashboard test2: peso serie 1 = 40");

    // --- 4b. `test` NO ve las sesiones de test2 (RLS) -----------------------
    const testId = await loginTest(anonTest, admin);
    assert(testId !== test2Id, "test y test2 son usuarios distintos");
    const { data: testSeesTest2 } = await anonTest
      .from("workout_sessions")
      .select("id")
      .eq("id", sessionId);
    assert((testSeesTest2?.length ?? 0) === 0, "RLS: `test` no ve la sesión de test2");

    // --- 4c. El chip ACTIVA de test2 apunta a su plantilla ------------------
    const { data: prof2 } = await anon2
      .from("profiles")
      .select("active_template_id")
      .eq("id", test2Id!)
      .single();
    const list2 = await loadTemplates(anon2, test2Id!, prof2!.active_template_id);
    const active2 = list2.filter((t) => t.isActive);
    assert(active2.length === 1, "test2: exactamente 1 plantilla ACTIVA");
    assert(active2[0].id === test2TemplateId, "test2: la ACTIVA es SU plantilla");
    assert(active2[0].isOwn && !active2[0].isSystem, "test2: su plantilla es Tuya, no Sistema");
    assert(active2[0].blockCount >= 3, "test2: su plantilla cuenta el bloque nuevo");

    // test2 ve BILBO como Sistema en su lista.
    const bilboInList = list2.find((t) => t.id === BILBO_ID);
    assert(bilboInList?.isSystem === true, "test2: BILBO aparece como Sistema");
    assert(bilboInList?.isActive === false, "test2: BILBO no está activa para test2");

    // --- 4d. Entrenar de `test` sigue mostrando BILBO -----------------------
    const { data: profTest } = await anonTest
      .from("profiles")
      .select("active_template_id")
      .eq("id", testId)
      .single();
    assert(
      profTest?.active_template_id === BILBO_ID,
      "`test` sigue con BILBO como plantilla activa",
    );
    const { data: testBlocks } = await anonTest
      .from("template_blocks")
      .select("id, slug")
      .eq("template_id", BILBO_ID)
      .order("position");
    assert((testBlocks?.length ?? 0) >= 1, "Entrenar de `test`: bloques de BILBO presentes");
    assert(
      !(testBlocks ?? []).some((b) => b.slug === newSlug),
      "Entrenar de `test` NO incluye el bloque nuevo de test2",
    );

    // --- 5. Archivado vs delete de ejercicio --------------------------------
    // coreEx tiene un session_set → debe archivarse (réplica de deleteExercise).
    {
      const { count } = await anon2
        .from("session_sets")
        .select("id", { count: "exact", head: true })
        .eq("exercise_id", coreEx!.id);
      assert((count ?? 0) > 0, "coreEx tiene session_sets registrados");
      // Al archivar, se desmarca core (para no romper índice / dashboard).
      const { error } = await anon2
        .from("template_exercises")
        .update({ archived: true, is_core: false })
        .eq("id", coreEx!.id);
      assert(!error, "ejercicio con registros: se archiva (no delete)");
      const { data: after } = await anon2
        .from("template_exercises")
        .select("archived")
        .eq("id", coreEx!.id)
        .single();
      assert(after?.archived === true, "coreEx quedó archived=true");

      // Editor no muestra archivados en la lista activa (loadEditorTemplate marca archived).
      const editor = await loadEditorTemplate(anon2, test2TemplateId!);
      const hombroBlock = editor!.blocks.find((b) => b.slug === newSlug);
      const activeNames = hombroBlock!.exercises.filter((e) => !e.archived).map((e) => e.name);
      assert(
        !activeNames.includes("Press militar"),
        "editor: Press militar (archivado) no está entre los activos",
      );
      const archivedNames = hombroBlock!.exercises.filter((e) => e.archived).map((e) => e.name);
      assert(
        archivedNames.includes("Press militar"),
        "editor: Press militar aparece en la sección de archivados",
      );
    }

    // exB NO tiene registros de session_sets tras... espera, exB SÍ tiene uno.
    // Creamos un ejercicio efímero sin registros y lo borramos de verdad.
    {
      const { data: ephemeral } = await anon2
        .from("template_exercises")
        .insert({
          block_id: newBlock!.id,
          name: "Efímero",
          target_sets: 1,
          is_core: false,
          position: 5,
        })
        .select("id")
        .single();
      const { count } = await anon2
        .from("session_sets")
        .select("id", { count: "exact", head: true })
        .eq("exercise_id", ephemeral!.id);
      assert((count ?? 0) === 0, "ejercicio efímero sin session_sets");
      const { error: delErr } = await anon2
        .from("template_exercises")
        .delete()
        .eq("id", ephemeral!.id);
      assert(!delErr, "ejercicio sin registros: delete real");
      const { data: gone } = await anon2
        .from("template_exercises")
        .select("id")
        .eq("id", ephemeral!.id);
      assert((gone?.length ?? 0) === 0, "ejercicio efímero borrado de verdad");
    }

    // --- Confirmación: borrar la plantilla de test2 con sesiones FALLA ------
    {
      const { error } = await anon2
        .from("workout_templates")
        .delete()
        .eq("id", test2TemplateId!);
      assert(
        !!error,
        "borrar plantilla con sesiones registradas falla por FK (protege histórico)",
      );
    }

    console.log("\n✅ Verificación Fase 5 OK");
  } finally {
    await cleanup();
    // Comprobación de limpieza.
    const { data: leftProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("username", TEST2)
      .maybeSingle();
    assert(!leftProfile, "limpieza: usuario test2 eliminado");
    if (test2TemplateId) {
      const { data: leftT } = await admin
        .from("workout_templates")
        .select("id")
        .eq("id", test2TemplateId);
      assert((leftT?.length ?? 0) === 0, "limpieza: plantilla de test2 eliminada");
    }
    // `test` sigue con BILBO activa.
    const { data: testProf } = await admin
      .from("profiles")
      .select("active_template_id")
      .eq("username", "test")
      .maybeSingle();
    assert(
      testProf?.active_template_id === BILBO_ID,
      "limpieza: `test` sigue con BILBO activa",
    );
    console.log("🧹 Limpieza completada");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
