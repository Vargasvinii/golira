-- GOLIRA v10 - Notificações. Pode rodar mais de uma vez.
create table if not exists public.push_subscriptions (
  endpoint text primary key
    check (endpoint ~ '^https://([a-z0-9-]+\.)*(googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)/'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.notification_prefs (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  morning boolean not null default true,
  water boolean not null default true,
  workout boolean not null default true,
  streak boolean not null default true
);
create table if not exists public.push_sent (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  hour smallint not null,
  primary key (user_id, day, hour)
);

alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.push_sent enable row level security; -- sem políticas: só o servidor usa

drop policy if exists "push: os meus" on public.push_subscriptions;
create policy "push: os meus" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "avisos: os meus" on public.notification_prefs;
create policy "avisos: os meus" on public.notification_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, delete on public.push_subscriptions to authenticated;
grant select, insert, update on public.notification_prefs to authenticated;
grant all on public.push_subscriptions, public.notification_prefs, public.push_sent to service_role;

-- o aparelho passa a ser de quem está logado nele agora
create or replace function public.register_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language sql security definer set search_path = '' as $$
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
$$;
revoke execute on function public.register_push(text, text, text) from public, anon;
grant execute on function public.register_push(text, text, text) to authenticated;

-- Agendador: 8, 11, 15, 18, 19 e 21h de Brasília (em UTC: 11, 14, 18, 21, 22 e 0h).
-- Troque SEU-SITE e SEU-SEGREDO na hora de rodar. NUNCA salve o segredo no GitHub.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('golira-avisos', '0 0,11,14,18,21,22 * * *', $cron$
  select net.http_post(
    url := 'https://SEU-SITE/api/avisos',
    headers := '{"Authorization": "Bearer SEU-SEGREDO"}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);
