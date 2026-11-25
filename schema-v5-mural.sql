-- GOLIRA v5 - Mural: limpeza automática dos recados antigos
-- Os recados já ficam invisíveis após 24h (regra de segurança do banco).
-- Este script só APAGA de verdade os de mais de 48h, para o banco não crescer.
-- Pode rodar mais de uma vez sem problema.

create extension if not exists pg_cron with schema extensions;

do $$
begin
  perform cron.unschedule('golira-limpa-mural');
exception when others then
  null; -- ainda não existia
end $$;

select cron.schedule(
  'golira-limpa-mural',
  '17 6 * * *', -- todo dia 06:17 UTC (03:17 em Brasília)
  $$ delete from public.mural_posts where created_at < now() - interval '48 hours' $$
);
