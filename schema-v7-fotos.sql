-- GOLIRA v7 - Fotos no Mural e no Recado macaquista
-- Fotos ficam num espaço PRIVADO (Storage "mural"), em pastas por grupo.
-- Só a matilha enxerga as fotos do grupo; as do ADM (pasta "adm") todos enxergam.
-- Pode rodar mais de uma vez.

-- 1) espaço das fotos (privado, máx. 1 MB por foto, só JPEG)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mural', 'mural', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];

-- 2) regras de acesso às fotos
drop policy if exists "mural fotos: ver" on storage.objects;
create policy "mural fotos: ver" on storage.objects for select to authenticated
  using (bucket_id = 'mural' and (
    (storage.foldername(name))[1] = public.my_group_id()::text
    or (storage.foldername(name))[1] = 'adm'));

drop policy if exists "mural fotos: enviar" on storage.objects;
create policy "mural fotos: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'mural' and (
    (storage.foldername(name))[1] = public.my_group_id()::text
    or ((storage.foldername(name))[1] = 'adm' and public.is_admin())));

-- apagar: a própria foto; qualquer um da matilha limpa foto com mais de 24h (faxina); ADM cuida da pasta adm
drop policy if exists "mural fotos: apagar" on storage.objects;
create policy "mural fotos: apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'mural' and (
    ((storage.foldername(name))[1] = public.my_group_id()::text
       and (owner = auth.uid() or created_at < now() - interval '24 hours'))
    or ((storage.foldername(name))[1] = 'adm' and public.is_admin())));

-- 3) colunas e regras dos recados
alter table public.mural_posts add column if not exists image_path text
  check (image_path is null or length(image_path) < 200);
alter table public.admin_announcements add column if not exists image_path text
  check (image_path is null or (image_path like 'adm/%' and length(image_path) < 200));

-- recado pode ser só foto (texto vazio) desde que tenha foto
alter table public.mural_posts drop constraint if exists mural_posts_content_check;
alter table public.mural_posts add constraint mural_posts_content_check
  check (char_length(content) <= 280 and (char_length(content) >= 1 or image_path is not null));
alter table public.admin_announcements drop constraint if exists admin_announcements_content_check;
alter table public.admin_announcements add constraint admin_announcements_content_check
  check (char_length(content) <= 500 and (char_length(content) >= 1 or image_path is not null));

-- a foto do recado precisa estar na pasta do grupo de quem posta
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

  if new.image_path is not null and new.image_path not like p.group_id::text || '/%' then
    raise exception 'foto fora da pasta do grupo';
  end if;
  return new;
end;
$$;
