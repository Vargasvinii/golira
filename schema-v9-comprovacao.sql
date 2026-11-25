-- GOLIRA v9 - Comprovação de treino (selo TREINO PAGO)
-- A foto NÃO é guardada aqui. Só fica o registro de que o Gorilão aprovou no dia.
-- Pode rodar mais de uma vez.

create table if not exists public.workout_proofs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.workout_proofs enable row level security;

-- cada um só LÊ o próprio selo. Quem grava é apenas o servidor (chave secreta).
drop policy if exists "provas: ver as minhas" on public.workout_proofs;
create policy "provas: ver as minhas" on public.workout_proofs
  for select to authenticated using (user_id = auth.uid());

revoke all on public.workout_proofs from anon, authenticated;
grant select on public.workout_proofs to authenticated;
grant select, insert, update on public.workout_proofs to service_role;

-- selos da matilha nas últimas 24h: só nome e horário
create or replace function public.group_proofs()
returns table (display_name text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.display_name, w.created_at
  from public.workout_proofs w
  join public.profiles p on p.id = w.user_id
  where w.created_at > now() - interval '24 hours'
    and p.group_id is not null
    and p.group_id = (select group_id from public.profiles where id = auth.uid())
    and (p.show_profile or p.id = auth.uid())
  order by w.created_at desc;
$$;

revoke execute on function public.group_proofs() from public, anon;
grant execute on function public.group_proofs() to authenticated;
