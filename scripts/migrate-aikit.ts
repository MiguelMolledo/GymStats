/**
 * Importa los datos del tracker antiguo (SQLite exportado de la app "aikit")
 * al esquema de GymStats en Supabase.
 *
 * Uso:
 *   npx tsx scripts/migrate-aikit.ts [ruta-al-sqlite] [--dry-run]
 *
 * Por defecto la ruta es:
 *   /Users/miguelmolledoalvarez/Downloads/GYM Tracker — Miguel (1).sqlite
 *
 * - Usa la SERVICE ROLE key (bypassa RLS) leída de .env.local.
 * - Idempotente: los UUID de sessions/sets/cycles se derivan con UUIDv5 a
 *   partir de un namespace fijo + el id original, y se hace upsert onConflict:'id'.
 *   Re-ejecutar no duplica.
 * - Requiere que el profile `miguel` ya exista (NO lo crea). Si no existe, aborta.
 * - --dry-run valida todos los mapeos sin escribir nada.
 */
import { createHash } from "node:crypto";
import path from "node:path";

import Database from "better-sqlite3";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import type { Database as DB } from "../src/lib/supabase/database.types";

// --- Config ---------------------------------------------------------------
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const DEFAULT_SQLITE =
  "/Users/miguelmolledoalvarez/Downloads/GYM Tracker — Miguel (1).sqlite";
const BILBO_TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";
const MIGUEL_USERNAME = "miguel";

// Namespace fijo (UUID) para derivar UUIDs deterministas (UUIDv5, DNS-like).
const AIKIT_NAMESPACE = "6ba7b815-9dad-11d1-80b4-00c04fd430c8";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sqlitePath = args.find((a) => !a.startsWith("--")) ?? DEFAULT_SQLITE;

// --- Utilidades -----------------------------------------------------------

/** UUIDv5 (SHA-1) determinista a partir de namespace + nombre. */
function uuidv5(name: string, namespace = AIKIT_NAMESPACE): string {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const nameBytes = Buffer.from(name, "utf8");
  const hash = createHash("sha1")
    .update(nsBytes)
    .update(nameBytes)
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versión 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

// --- Tipos del origen ------------------------------------------------------
interface SrcSession {
  id: number;
  fecha: string;
  bloque: string;
  notas: string | null;
}
interface SrcSet {
  id: number;
  session_id: number;
  ejercicio: string;
  serie: number;
  repeticiones: number;
  peso: number;
  notas: string | null;
}
interface SrcCycle {
  id: number;
  bloque: string;
  ejercicio: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  peso_inicio: number | null;
  peso_maximo: number | null;
  reps_cierre: number | null;
  activo: number;
  notas: string | null;
}

async function main() {
  console.log(`\n📦 GymStats · Importación aikit → Supabase`);
  console.log(`   Origen : ${sqlitePath}`);
  console.log(`   Modo   : ${dryRun ? "DRY-RUN (no escribe)" : "ESCRITURA"}\n`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }

  const supabase = createClient<DB, "gymstats">(url, serviceKey, {
    db: { schema: "gymstats" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- 1. Localizar profile miguel ---------------------------------------
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", MIGUEL_USERNAME)
    .maybeSingle();

  if (profileErr) fail(`Error consultando profiles: ${profileErr.message}`);

  // En modo escritura, la ausencia de miguel es un error fatal (no lo creamos).
  // En dry-run seguimos validando el resto con un user_id placeholder.
  const MISSING_MSG = `El profile "${MIGUEL_USERNAME}" no existe. Regístrate primero con username ${MIGUEL_USERNAME} y vuelve a ejecutar este script.`;
  if (!profile && !dryRun) fail(MISSING_MSG);

  const PLACEHOLDER_USER = "00000000-0000-0000-0000-000000000000";
  const userId = profile?.id ?? PLACEHOLDER_USER;
  if (profile) {
    console.log(`✓ Profile miguel: ${userId}`);
  } else {
    console.log(`⚠ Profile miguel NO existe (dry-run: continúo validando mapeos con placeholder)`);
  }

  // --- 2. Localizar plantilla BILBO + bloques + ejercicios ---------------
  const { data: blocks, error: blocksErr } = await supabase
    .from("template_blocks")
    .select("id, slug")
    .eq("template_id", BILBO_TEMPLATE_ID);
  if (blocksErr) fail(`Error consultando bloques: ${blocksErr.message}`);
  if (!blocks || blocks.length === 0) {
    fail("No se encontraron bloques de la plantilla BILBO. ¿Se aplicó el seed?");
  }
  const blockBySlug = new Map(blocks!.map((b) => [b.slug, b.id]));

  const blockIds = blocks!.map((b) => b.id);
  const { data: exercises, error: exErr } = await supabase
    .from("template_exercises")
    .select("id, block_id, name")
    .in("block_id", blockIds);
  if (exErr) fail(`Error consultando ejercicios: ${exErr.message}`);

  const slugByBlockId = new Map(blocks!.map((b) => [b.id, b.slug]));
  // Clave: `${slug}::${nombre-lowercased}` -> exercise_id (matching case-insensitive)
  const exerciseByKey = new Map<string, string>();
  for (const e of exercises ?? []) {
    const slug = slugByBlockId.get(e.block_id)!;
    exerciseByKey.set(`${slug}::${e.name.toLowerCase()}`, e.id);
  }
  console.log(
    `✓ Plantilla BILBO: ${blocks!.length} bloques, ${exercises?.length ?? 0} ejercicios`,
  );

  // --- 3. Leer SQLite -----------------------------------------------------
  const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const srcSessions = db.prepare("SELECT * FROM sessions").all() as SrcSession[];
  const srcSets = db.prepare("SELECT * FROM sets").all() as SrcSet[];
  const srcCycles = db.prepare("SELECT * FROM cycles").all() as SrcCycle[];
  db.close();
  console.log(
    `✓ Origen leído: ${srcSessions.length} sessions, ${srcSets.length} sets, ${srcCycles.length} cycles`,
  );

  // --- 4. Validar mapeos ANTES de escribir nada --------------------------
  const unmapped = new Set<string>();
  const resolveExercise = (bloque: string, ejercicio: string): string | null => {
    return exerciseByKey.get(`${bloque}::${ejercicio.toLowerCase()}`) ?? null;
  };
  const resolveBlock = (bloque: string): string | null =>
    blockBySlug.get(bloque) ?? null;

  for (const s of srcSessions) {
    if (!resolveBlock(s.bloque)) unmapped.add(`bloque (session): ${s.bloque}`);
  }
  const sessionById = new Map(srcSessions.map((s) => [s.id, s]));
  for (const st of srcSets) {
    const sess = sessionById.get(st.session_id);
    if (!sess) {
      unmapped.add(`set ${st.id} sin session ${st.session_id}`);
      continue;
    }
    if (!resolveExercise(sess.bloque, st.ejercicio)) {
      unmapped.add(`ejercicio (${sess.bloque}): ${st.ejercicio}`);
    }
  }
  for (const c of srcCycles) {
    if (!resolveBlock(c.bloque)) unmapped.add(`bloque (cycle): ${c.bloque}`);
    if (!resolveExercise(c.bloque, c.ejercicio)) {
      unmapped.add(`ejercicio ciclo (${c.bloque}): ${c.ejercicio}`);
    }
  }

  if (unmapped.size > 0) {
    console.error("\n❌ Mapeos no resueltos (no se ha escrito nada):");
    for (const u of [...unmapped].sort()) console.error(`   - ${u}`);
    process.exit(1);
  }
  console.log("✓ Todos los mapeos resueltos correctamente");

  // --- 5. Construir filas destino ----------------------------------------
  const sessionRows = srcSessions.map((s) => ({
    id: uuidv5(`aikit-session-${s.id}`),
    user_id: userId,
    template_id: BILBO_TEMPLATE_ID,
    block_id: resolveBlock(s.bloque)!,
    performed_on: s.fecha.slice(0, 10),
    notes: s.notas ?? "",
    status: "completed" as const,
    started_at: s.fecha,
    completed_at: s.fecha,
    updated_at: s.fecha,
  }));

  const setRows = srcSets.map((st) => {
    const sess = sessionById.get(st.session_id)!;
    return {
      id: uuidv5(`aikit-set-${st.id}`),
      session_id: uuidv5(`aikit-session-${st.session_id}`),
      exercise_id: resolveExercise(sess.bloque, st.ejercicio)!,
      set_number: st.serie,
      weight: st.peso,
      reps: st.repeticiones,
      notes: st.notas ?? "",
    };
  });

  const cycleRows = srcCycles.map((c) => ({
    id: uuidv5(`aikit-cycle-${c.id}`),
    user_id: userId,
    template_id: BILBO_TEMPLATE_ID,
    block_id: resolveBlock(c.bloque)!,
    exercise_id: resolveExercise(c.bloque, c.ejercicio)!,
    status: (c.activo === 1 ? "active" : "closed") as "active" | "closed",
    started_at: c.fecha_inicio,
    ended_at: c.fecha_fin,
    start_weight: c.peso_inicio,
    max_weight: c.peso_maximo,
    closing_reps: c.reps_cierre,
    notes: c.notas ?? "",
  }));

  if (dryRun) {
    console.log("\n🔎 DRY-RUN: filas que se escribirían:");
    console.log(`   workout_sessions: ${sessionRows.length}`);
    console.log(`   session_sets    : ${setRows.length}`);
    console.log(`   cycles          : ${cycleRows.length}`);
    console.log("\n✓ Validación completa. No se ha escrito nada (--dry-run).\n");
    return;
  }

  // --- 6. Escribir (upsert idempotente) ----------------------------------
  const upSessions = await supabase
    .from("workout_sessions")
    .upsert(sessionRows, { onConflict: "id" });
  if (upSessions.error) fail(`upsert workout_sessions: ${upSessions.error.message}`);

  const upSets = await supabase
    .from("session_sets")
    .upsert(setRows, { onConflict: "id" });
  if (upSets.error) fail(`upsert session_sets: ${upSets.error.message}`);

  const upCycles = await supabase
    .from("cycles")
    .upsert(cycleRows, { onConflict: "id" });
  if (upCycles.error) fail(`upsert cycles: ${upCycles.error.message}`);

  // --- 7. Marcar plantilla activa de miguel ------------------------------
  const upProfile = await supabase
    .from("profiles")
    .update({ active_template_id: BILBO_TEMPLATE_ID })
    .eq("id", userId);
  if (upProfile.error) fail(`update profiles.active_template_id: ${upProfile.error.message}`);

  console.log("\n✅ Importación completada:");
  console.log(`   workout_sessions upsert: ${sessionRows.length}`);
  console.log(`   session_sets     upsert: ${setRows.length}`);
  console.log(`   cycles           upsert: ${cycleRows.length}`);
  console.log(`   miguel.active_template_id = BILBO\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
