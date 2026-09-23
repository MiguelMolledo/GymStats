-- GymStats · Seed · Plantilla del sistema BILBO (metodología de Miguel)
-- Idempotente: usa UUIDs fijos + ON CONFLICT DO NOTHING. created_by = NULL
-- => plantilla del sistema (solo la toca la service role, RLS la protege).
--
-- Este fichero NO se ejecuta con `supabase db push` contra el remoto. Para
-- aplicarlo al proyecto remoto usa psql con la connection string del pooler:
--
--   psql "postgresql://postgres.<REF>:<DB_PASSWORD_URLENCODED>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres" \
--        -f supabase/seed.sql
--
-- (localmente `supabase db reset` sí lo aplica).

-- ---------------------------------------------------------------------------
-- Template BILBO
-- ---------------------------------------------------------------------------
insert into gymstats.workout_templates (id, name, plugin_key, config, created_by)
values (
  '11111111-1111-4111-8111-111111111111',
  'BILBO',
  'bilbo',
  '{"target_reps": 32, "floor_reps": 12}'::jsonb,
  null
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Bloques (UUIDs deterministas para idempotencia y para referenciarlos abajo)
-- ---------------------------------------------------------------------------
insert into gymstats.template_blocks (id, template_id, slug, label, emoji, accent_color, position)
values
  ('11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-111111111111', 'pecho',   'Pecho y Tríceps',  '⚡️', '#3b82f6', 1),
  ('11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-111111111111', 'espalda', 'Espalda y Hombro', '🔥', '#d946ef', 2),
  ('11111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-111111111111', 'piernas', 'Piernas',          '🦾', '#10b981', 3)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Ejercicios (UUID determinista por bloque+posición para idempotencia)
-- ---------------------------------------------------------------------------
insert into gymstats.template_exercises (id, block_id, name, target_sets, is_core, position)
values
  -- pecho
  ('11111111-1111-4111-8111-100000000001', '11111111-1111-4111-8111-000000000001', 'Press de banca',  3, true,  1),
  ('11111111-1111-4111-8111-100000000002', '11111111-1111-4111-8111-000000000001', 'Press Militar',   2, false, 2),
  ('11111111-1111-4111-8111-100000000003', '11111111-1111-4111-8111-000000000001', 'Aperturas Pecho', 2, false, 3),
  ('11111111-1111-4111-8111-100000000004', '11111111-1111-4111-8111-000000000001', 'Triceps polea',   2, false, 4),
  ('11111111-1111-4111-8111-100000000005', '11111111-1111-4111-8111-000000000001', 'Biceps Polea',    2, false, 5),
  -- espalda
  ('11111111-1111-4111-8111-200000000001', '11111111-1111-4111-8111-000000000002', 'Polea alta bilateral',    3, true,  1),
  ('11111111-1111-4111-8111-200000000002', '11111111-1111-4111-8111-000000000002', 'Remo deltoide superior',  1, false, 2),
  ('11111111-1111-4111-8111-200000000003', '11111111-1111-4111-8111-000000000002', 'Remo Gironda',            2, false, 3),
  ('11111111-1111-4111-8111-200000000004', '11111111-1111-4111-8111-000000000002', 'Elevaciones laterales',   2, false, 4),
  ('11111111-1111-4111-8111-200000000005', '11111111-1111-4111-8111-000000000002', 'Peso muerto',             2, false, 5),
  -- piernas
  ('11111111-1111-4111-8111-300000000001', '11111111-1111-4111-8111-000000000003', 'Sentadilla',    3, true,  1),
  ('11111111-1111-4111-8111-300000000002', '11111111-1111-4111-8111-000000000003', 'Leg Extension', 2, false, 2),
  ('11111111-1111-4111-8111-300000000003', '11111111-1111-4111-8111-000000000003', 'Leg pull',      2, false, 3),
  ('11111111-1111-4111-8111-300000000004', '11111111-1111-4111-8111-000000000003', 'Abductores',    1, false, 4),
  ('11111111-1111-4111-8111-300000000005', '11111111-1111-4111-8111-000000000003', 'Búlgaras',      1, false, 5),
  ('11111111-1111-4111-8111-300000000006', '11111111-1111-4111-8111-000000000003', 'Gemelos',       1, false, 6)
on conflict (id) do nothing;
