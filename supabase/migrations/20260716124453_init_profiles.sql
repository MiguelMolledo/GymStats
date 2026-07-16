-- GymStats · Fase 0 · Migración inicial
-- Tabla profiles + RLS + trigger handle_new_user

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text not null,
  -- active_template_id: la tabla workout_templates llega en Fase 1, sin FK todavía
  active_template_id uuid,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- SELECT: cualquier usuario autenticado puede ver todos los perfiles
-- (son 2 usuarios de la misma casa).
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

-- UPDATE: cada usuario solo puede modificar su propia fila.
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Trigger: al crear un usuario en auth.users se crea automáticamente su profile,
-- leyendo username y display_name desde raw_user_meta_data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'display_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
