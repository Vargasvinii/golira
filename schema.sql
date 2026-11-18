-- =====================================================================
-- GOLIRA - schema inicial (Supabase / Postgres)
-- Rode inteiro no SQL Editor do Supabase.
-- Cobre: perfis, grupos (tag), mural (24h), reacoes, recado do ADM,
-- agua e fichas de treino (inclui as criadas pela IA).
-- =====================================================================

-- =====================================================================
-- 1. GRUPOS E PERFIS
-- =====================================================================
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique
    check (tag = upper(tag) and char_length(tag) between 3 and 30),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Gorila',
  weight_kg numeric(5,1) check (weight_kg between 20 and 400),
  height_cm numeric(5,1) check (height_cm between 80 and 260),
  goal text,
  water_goal_ml integer not null default 3000
    check (water_goal_ml between 500 and 10000),
  group_id uuid references public.groups(id) on delete set null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Funcoes auxiliares (security definer evita recursao nas policies)
create or replace function public.my_group_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select group_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Cria o perfil automaticamente no primeiro login (Google)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(split_part(coalesce(new.raw_user_meta_data->>'full_name', ''), ' ', 1), ''),
      'Gorila'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: perfil
alter table public.profiles enable row level security;

create policy "perfil: ler o proprio"
  on public.profiles for select
  using (id = auth.uid());

create policy "perfil: editar o proprio"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- O usuario NAO pode mudar is_admin nem group_id direto
-- (grupo muda so pela funcao set_group abaixo)
revoke update on public.profiles from authenticated, anon;
grant update (display_name, weight_kg, height_cm, goal, water_goal_ml)
  on public.profiles to authenticated;

-- RLS: grupos (cada um so enxerga o proprio grupo)
alter table public.groups enable row level security;

create policy "grupo: ver o meu"
  on public.groups for select
  using (id = public.my_group_id());

-- Entrar/criar/sair de grupo pela tag. Tag vazia = sair do grupo.
create or replace function public.set_group(p_tag text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_tag text := upper(trim(coalesce(p_tag, '')));
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'nao autenticado';
  end if;

  if v_tag = '' then
    update public.profiles set group_id = null where id = auth.uid();
    return;
  end if;

  if char_length(v_tag) not between 3 and 30 then
    raise exception 'a tag precisa ter entre 3 e 30 caracteres';
  end if;

  insert into public.groups (tag) values (v_tag)
  on conflict (tag) do nothing;

  select id into v_id from public.groups where tag = v_tag;
  update public.profiles set group_id = v_id where id = auth.uid();
end;
$$;

revoke execute on function public.set_group(text) from anon;

-- =====================================================================
-- 2. MURAL (recados do grupo, visiveis por 24h)
-- =====================================================================
create table public.mural_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  author_name text not null default 'Gorila',
  group_id uuid not null references public.groups(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 280),
  created_at timestamptz not null default now()
);

create index mural_posts_group_created_idx
  on public.mural_posts (group_id, created_at desc);

-- Preenche autor e grupo no servidor (o cliente nao consegue forjar)
create or replace function public.mural_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p record;
begin
  select display_name, group_id into p
  from public.profiles where id = auth.uid();

  if p.group_id is null then
    raise exception 'entre em um grupo antes de postar';
  end if;

  new.author_id   := auth.uid();
  new.author_name := p.display_name;
  new.group_id    := p.group_id;
  return new;
end;
$$;

create trigger mural_before_insert
  before insert on public.mural_posts
  for each row execute function public.mural_before_insert();

alter table public.mural_posts enable row level security;

-- Regra das 24h corridas. Para "reseta todo dia as 6h (Sao Paulo)", troque
-- a condicao de data por:
--   created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo' - interval '6 hours')
--                  + interval '6 hours') at time zone 'America/Sao_Paulo'
create policy "mural: ler recados do meu grupo (24h)"
  on public.mural_posts for select
  using (
    group_id = public.my_group_id()
    and created_at > now() - interval '24 hours'
  );

create policy "mural: postar no meu grupo"
  on public.mural_posts for insert
  with check (group_id = public.my_group_id());

create policy "mural: apagar o proprio recado"
  on public.mural_posts for delete
  using (author_id = auth.uid());

-- Reacoes
create table public.mural_reactions (
  post_id uuid not null references public.mural_posts(id) on delete cascade,
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('🦍', '🔥', '💪')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

alter table public.mural_reactions enable row level security;

-- O subselect respeita a RLS de mural_posts: so reage/ve quem ve o recado
create policy "reacoes: ler as dos recados que eu vejo"
  on public.mural_reactions for select
  using (exists (select 1 from public.mural_posts p where p.id = post_id));

create policy "reacoes: reagir"
  on public.mural_reactions for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.mural_posts p where p.id = post_id)
  );

create policy "reacoes: remover a propria"
  on public.mural_reactions for delete
  using (user_id = auth.uid());

-- =====================================================================
-- 3. RECADO MACAQUISTA (so o ADM escreve, todos leem)
-- =====================================================================
create table public.admin_announcements (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(content) between 1 and 500),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.admin_announcements enable row level security;

create policy "recado adm: todos leem"
  on public.admin_announcements for select
  to authenticated
  using (true);

create policy "recado adm: so o adm publica"
  on public.admin_announcements for insert
  to authenticated
  with check (public.is_admin());

create policy "recado adm: so o adm apaga"
  on public.admin_announcements for delete
  to authenticated
  using (public.is_admin());

-- O app mostra o mais recente:
--   select * from admin_announcements order by created_at desc limit 1;

-- =====================================================================
-- 4. AGUA
-- =====================================================================
create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  amount_ml integer not null check (amount_ml between 50 and 2000),
  logged_at timestamptz not null default now()
);

create index water_logs_user_logged_idx
  on public.water_logs (user_id, logged_at desc);

alter table public.water_logs enable row level security;

create policy "agua: so os meus registros"
  on public.water_logs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- 5. FICHAS DE TREINO (manuais ou criadas pelo Gorilao)
-- =====================================================================
create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  goal text,
  is_active boolean not null default false,
  created_by text not null default 'user' check (created_by in ('user', 'ai')),
  created_at timestamptz not null default now()
);

-- Apenas uma ficha ativa por usuario
create unique index workout_plans_one_active_idx
  on public.workout_plans (user_id) where is_active;

create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  weekday smallint check (weekday between 0 and 6), -- 0 = domingo (opcional)
  position smallint not null default 0
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.workout_days(id) on delete cascade,
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sets smallint not null default 3 check (sets between 1 and 10),
  reps text not null default '10' check (char_length(reps) <= 20), -- ex.: '8-10'
  rest_seconds integer check (rest_seconds between 0 and 600),
  load_kg numeric(6,2) check (load_kg >= 0),
  notes text check (char_length(notes) <= 300),
  position smallint not null default 0
);

alter table public.workout_plans enable row level security;
alter table public.workout_days enable row level security;
alter table public.workout_exercises enable row level security;

create policy "fichas: so as minhas"
  on public.workout_plans for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "dias: so os meus"
  on public.workout_days for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workout_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "exercicios: so os meus"
  on public.workout_exercises for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workout_days d
      where d.id = day_id and d.user_id = auth.uid()
    )
  );

-- =====================================================================
-- 6. REALTIME (mural ao vivo)
-- =====================================================================
alter publication supabase_realtime
  add table public.mural_posts, public.mural_reactions;

-- =====================================================================
-- 7. OPCIONAIS
-- =====================================================================
-- Limpeza automatica dos recados velhos (ative a extensao pg_cron antes).
-- 09:00 UTC = 06:00 em Sao Paulo.
-- select cron.schedule(
--   'limpar-mural', '0 9 * * *',
--   $$ delete from public.mural_posts where created_at < now() - interval '48 hours' $$
-- );

-- Te tornar ADM: faca login com Google UMA vez no app e depois rode:
-- update public.profiles set is_admin = true
-- where id = (select id from auth.users where email = 'SEU_EMAIL@gmail.com');
