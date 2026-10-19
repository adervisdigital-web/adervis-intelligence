-- ADERVIS Intelligence · расписание утренней сводки
--
-- Раз в час (в :05) база вызывает функцию digest; та сама решает, кому
-- сейчас пора отправлять. Секрет расписания читается из channel_secrets в
-- момент вызова — в тексте задания его нет. Применять к проекту вручную:
--   supabase db query --linked -f supabase/cron/digest.sql
-- В тестовой базе (PGlite) pg_cron и pg_net нет, поэтому это не миграция.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'intel-digest';
select cron.schedule('intel-digest', '5 * * * *', $job$
  select net.http_post(
    url := 'https://mlsmybtspqqpsvbukbcj.supabase.co/functions/v1/digest',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-digest-secret', (select value from public.channel_secrets where name = 'digest_secret')),
    body := '{}'::jsonb
  )
$job$);

-- Брифы из ADERVIS CRM: каждые 30 минут функция crm подтягивает новые.
select cron.unschedule(jobid) from cron.job where jobname = 'intel-crm-sync';
select cron.schedule('intel-crm-sync', '*/30 * * * *', $job$
  select net.http_post(
    url := 'https://mlsmybtspqqpsvbukbcj.supabase.co/functions/v1/crm',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-digest-secret', (select value from public.channel_secrets where name = 'digest_secret')),
    body := '{"action":"sync"}'::jsonb
  )
$job$);
