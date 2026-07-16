-- GymStats · Fase 1 · Esquema de entrenamientos
-- Plantillas (plugins), bloques, ejercicios, sesiones, series y ciclos.
-- Todas las tablas con RLS. Se usa (select auth.uid()) en las policies para
-- que el planner lo evalúe una sola vez (initplan).

-- Extensión moddatetime para mantener updated_at automáticamente.
create extension if not exists moddatetime schema extensions;

-- ---------------------------------------------------------------------------
-- workout_templates: configuración de cada tipo de entrenamiento (plugin).
-- created_by NULL => plantilla del sistema (seed), solo tocable por service role.
-- ---------------------------------------------------------------------------
create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plugin_key text not null,
  config jsonb not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- template_blocks: bloques de una plantilla (pecho, espalda, piernas...).
-- ---------------------------------------------------------------------------
create table public.template_blocks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates (id) on delete cascade,
  slug text not null,
  label text not null,
  emoji text,
  accent_color text,
  position int not null,
  unique (template_id, slug)
);

-- ---------------------------------------------------------------------------
-- template_exercises: ejercicios de un bloque. Un único core por bloque.
-- archived: para la regla "archivar, no borrar" (Fase 5).
-- ---------------------------------------------------------------------------
create table public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.template_blocks (id) on delete cascade,
  name text not null,
  target_sets int not null default 1,
  is_core boolean not null default false,
  position int not null,
  archived boolean not null default false
);

-- Un solo ejercicio core (no archivado) por bloque.
create unique index template_exercises_one_core_per_block
  on public.template_exercises (block_id)
  where is_core and not archived;

-- ---------------------------------------------------------------------------
-- workout_sessions: una sesión de entrenamiento (un bloque concreto un día).
-- id SIN default: lo genera el cliente (offline-first).
-- Solo una sesión activa por usuario a la vez.
-- ---------------------------------------------------------------------------
create table public.workout_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid not null references public.workout_templates (id),
  block_id uuid not null references public.template_blocks (id),
  performed_on date not null,
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'completed', 'discarded')),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index workout_sessions_one_active_per_user
  on public.workout_sessions (user_id)
  where status = 'active';

create index workout_sessions_user_performed_on
  on public.workout_sessions (user_id, performed_on);

-- ---------------------------------------------------------------------------
-- session_sets: cada serie registrada dentro de una sesión.
-- id SIN default: cliente.
-- ---------------------------------------------------------------------------
create table public.session_sets (
  id uuid primary key,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id uuid not null references public.template_exercises (id),
  set_number int not null,
  weight numeric(6, 2),
  reps int,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  unique (session_id, exercise_id, set_number)
);

-- ---------------------------------------------------------------------------
-- cycles: ciclos de progresión por (usuario, bloque). Solo uno activo a la vez.
-- ---------------------------------------------------------------------------
create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid not null references public.workout_templates (id),
  block_id uuid not null references public.template_blocks (id),
  exercise_id uuid not null references public.template_exercises (id),
  status text not null default 'active' check (status in ('active', 'closed')),
  started_at timestamptz not null,
  ended_at timestamptz,
  start_weight numeric(6, 2),
  max_weight numeric(6, 2),
  closing_reps int,
  notes text not null default ''
);

create unique index cycles_one_active_per_user_block
  on public.cycles (user_id, block_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- FK pendiente de la Fase 0: profiles.active_template_id -> workout_templates
-- ---------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_active_template_id_fkey
  foreign key (active_template_id) references public.workout_templates (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Triggers updated_at (moddatetime) en sessions y sets.
-- ---------------------------------------------------------------------------
create trigger workout_sessions_set_updated_at
  before update on public.workout_sessions
  for each row execute function extensions.moddatetime (updated_at);

create trigger session_sets_set_updated_at
  before update on public.session_sets
  for each row execute function extensions.moddatetime (updated_at);

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table public.workout_templates enable row level security;
alter table public.template_blocks enable row level security;
alter table public.template_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_sets enable row level security;
alter table public.cycles enable row level security;

-- --- workout_templates ---
-- Cualquier autenticado puede leer todas las plantillas.
create policy "workout_templates_select_authenticated"
  on public.workout_templates for select
  to authenticated
  using (true);

-- Solo el dueño puede insertar/modificar/borrar sus plantillas.
-- Las del sistema (created_by null) solo las toca la service role (bypassa RLS).
create policy "workout_templates_insert_own"
  on public.workout_templates for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "workout_templates_update_own"
  on public.workout_templates for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "workout_templates_delete_own"
  on public.workout_templates for delete
  to authenticated
  using (created_by = (select auth.uid()));

-- --- template_blocks ---
create policy "template_blocks_select_authenticated"
  on public.template_blocks for select
  to authenticated
  using (true);

create policy "template_blocks_insert_own"
  on public.template_blocks for insert
  to authenticated
  with check (exists (
    select 1 from public.workout_templates t
    where t.id = template_id and t.created_by = (select auth.uid())
  ));

create policy "template_blocks_update_own"
  on public.template_blocks for update
  to authenticated
  using (exists (
    select 1 from public.workout_templates t
    where t.id = template_id and t.created_by = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workout_templates t
    where t.id = template_id and t.created_by = (select auth.uid())
  ));

create policy "template_blocks_delete_own"
  on public.template_blocks for delete
  to authenticated
  using (exists (
    select 1 from public.workout_templates t
    where t.id = template_id and t.created_by = (select auth.uid())
  ));

-- --- template_exercises ---
create policy "template_exercises_select_authenticated"
  on public.template_exercises for select
  to authenticated
  using (true);

create policy "template_exercises_insert_own"
  on public.template_exercises for insert
  to authenticated
  with check (exists (
    select 1 from public.template_blocks b
    join public.workout_templates t on t.id = b.template_id
    where b.id = block_id and t.created_by = (select auth.uid())
  ));

create policy "template_exercises_update_own"
  on public.template_exercises for update
  to authenticated
  using (exists (
    select 1 from public.template_blocks b
    join public.workout_templates t on t.id = b.template_id
    where b.id = block_id and t.created_by = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.template_blocks b
    join public.workout_templates t on t.id = b.template_id
    where b.id = block_id and t.created_by = (select auth.uid())
  ));

create policy "template_exercises_delete_own"
  on public.template_exercises for delete
  to authenticated
  using (exists (
    select 1 from public.template_blocks b
    join public.workout_templates t on t.id = b.template_id
    where b.id = block_id and t.created_by = (select auth.uid())
  ));

-- --- workout_sessions (solo del propio usuario) ---
create policy "workout_sessions_select_own"
  on public.workout_sessions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "workout_sessions_insert_own"
  on public.workout_sessions for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "workout_sessions_update_own"
  on public.workout_sessions for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "workout_sessions_delete_own"
  on public.workout_sessions for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- --- session_sets (propiedad vía join a la sesión) ---
create policy "session_sets_select_own"
  on public.session_sets for select
  to authenticated
  using (exists (
    select 1 from public.workout_sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ));

create policy "session_sets_insert_own"
  on public.session_sets for insert
  to authenticated
  with check (exists (
    select 1 from public.workout_sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ));

create policy "session_sets_update_own"
  on public.session_sets for update
  to authenticated
  using (exists (
    select 1 from public.workout_sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workout_sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ));

create policy "session_sets_delete_own"
  on public.session_sets for delete
  to authenticated
  using (exists (
    select 1 from public.workout_sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ));

-- --- cycles (solo del propio usuario) ---
create policy "cycles_select_own"
  on public.cycles for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "cycles_insert_own"
  on public.cycles for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "cycles_update_own"
  on public.cycles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "cycles_delete_own"
  on public.cycles for delete
  to authenticated
  using (user_id = (select auth.uid()));
