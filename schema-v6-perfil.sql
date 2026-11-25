-- GOLIRA v6 - Perfil da matilha: foto, "aparecer pra matilha" e sequência (streak)
-- Pode rodar mais de uma vez.

alter table public.profiles
  add column if not exists avatar text
    check (avatar is null or (avatar like 'data:image/%' and length(avatar) < 90000)),
  add column if not exists show_profile boolean not null default true,
  add column if not exists streak_days integer not null default 0
    check (streak_days between 0 and 1000),
  add column if not exists streak_day date;

-- a pessoa pode editar só estas colunas novas dela (is_admin e group_id continuam travados)
grant update (avatar, show_profile, streak_days, streak_day) on public.profiles to authenticated;

-- Lista da matilha: só nome, foto e sequência de quem tem a MESMA tag e deixou aparecer.
-- Peso, altura, objetivo, água, cigarro etc. NUNCA saem daqui.
create or replace function public.group_members()
returns table (id uuid, display_name text, avatar text, streak_days integer, streak_day date)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.display_name, p.avatar, p.streak_days, p.streak_day
  from public.profiles p
  where p.group_id is not null
    and p.group_id = (select group_id from public.profiles where id = auth.uid())
    and (p.show_profile or p.id = auth.uid())
  order by p.display_name;
$$;

revoke execute on function public.group_members() from public, anon;
grant execute on function public.group_members() to authenticated;
