-- =====================================================================
-- GOLIRA - v2 (Treino) - SO o que e novo
-- Rode este arquivo INTEIRO no SQL Editor do Supabase.
-- Pode rodar de novo sem medo: nada aqui da erro se ja existir.
-- NAO rode o schema.sql de novo.
-- =====================================================================

-- 1. EXERCICIOS: agora podem ser "series" ou "tempo" ----------------
alter table public.workout_exercises add column if not exists kind text not null default 'sets';
alter table public.workout_exercises add column if not exists duration_min integer;

do $$ begin
  alter table public.workout_exercises
    add constraint workout_exercises_kind_check check (kind in ('sets', 'time'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.workout_exercises
    add constraint workout_exercises_duration_check
    check (duration_min is null or duration_min between 1 and 300);
exception when duplicate_object then null; end $$;

-- 2. TREINOS FEITOS (sessoes) ---------------------------------------
-- Guardam uma "foto" do nome da ficha e dos exercicios no dia do treino,
-- para editar a ficha depois nao embaralhar o historico.
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  plan_id uuid references public.workout_plans(id) on delete set null,
  day_id uuid references public.workout_days(id) on delete set null,
  plan_name text not null,
  day_title text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  difficulty text check (difficulty in ('babinha', 'file', 'pesado', 'deus')),
  created_at timestamptz not null default now()
);

create index if not exists workout_sessions_user_started_idx
  on public.workout_sessions (user_id, started_at desc);

alter table public.workout_sessions enable row level security;

drop policy if exists "sessoes: so as minhas" on public.workout_sessions;
create policy "sessoes: so as minhas"
  on public.workout_sessions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. ITENS DO TREINO FEITO (cada exercicio, com check e carga) -------
create table if not exists public.workout_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  exercise_id uuid references public.workout_exercises(id) on delete set null,
  name text not null,
  kind text not null default 'sets' check (kind in ('sets', 'time')),
  sets smallint,
  reps text,
  duration_min integer,
  planned_load_kg numeric(6,2),
  done_load_kg numeric(6,2),
  done boolean not null default false,
  done_at timestamptz,
  position smallint not null default 0
);

create index if not exists workout_session_items_session_idx
  on public.workout_session_items (session_id);

alter table public.workout_session_items enable row level security;

drop policy if exists "itens do treino: so os meus" on public.workout_session_items;
create policy "itens do treino: so os meus"
  on public.workout_session_items for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workout_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

-- 4. PESO (um registro por dia) --------------------------------------
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  weight_kg numeric(5,1) not null check (weight_kg between 20 and 400),
  logged_on date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);

alter table public.weight_logs enable row level security;

drop policy if exists "peso: so os meus" on public.weight_logs;
create policy "peso: so os meus"
  on public.weight_logs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Fim. Se aparecer "Success. No rows returned", deu tudo certo.
