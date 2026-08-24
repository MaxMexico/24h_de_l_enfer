create extension if not exists pgcrypto;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  access_code text not null unique,
  race_start timestamptz not null,
  loop_km numeric not null default 1.41,
  ref_pace_sec int not null default 360,
  phases jsonb not null default '[
    {"id":"jour","label":"Jour","from":0,"to":720,"mode":"loops","loops":3},
    {"id":"nuit","label":"Nuit","from":720,"to":1200,"mode":"time","minutes":60},
    {"id":"finale","label":"Finale","from":1200,"to":1440,"mode":"loops","loops":2}
  ]'::jsonb,
  race_minutes int not null default 1440,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_loop_km_positive check (loop_km > 0),
  constraint teams_ref_pace_sane check (ref_pace_sec between 120 and 1800),
  constraint teams_phases_is_array check (jsonb_typeof(phases) = 'array')
);

create table public.runners (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  position int not null,
  color text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index runners_team_position_idx on public.runners (team_id, position);

create table public.legs (
  id uuid primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  runner_id uuid not null references public.runners(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  loops int not null default 0,
  note text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legs_loops_non_negative check (loops >= 0),
  constraint legs_ends_after_start check (ended_at is null or ended_at >= started_at)
);

create index legs_team_started_idx on public.legs (team_id, started_at);

-- Garde-fou structurel : au plus un relais ouvert par equipe.
-- Les relais supprimes (soft delete) sont exclus, sinon un relais annule
-- bloquerait definitivement l'ouverture du suivant.
create unique index legs_one_open_per_team
  on public.legs (team_id)
  where ended_at is null and deleted_at is null;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger teams_touch before update on public.teams
  for each row execute function public.touch_updated_at();
create trigger runners_touch before update on public.runners
  for each row execute function public.touch_updated_at();
create trigger legs_touch before update on public.legs
  for each row execute function public.touch_updated_at();
