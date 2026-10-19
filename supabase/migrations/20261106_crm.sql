-- ADERVIS Intelligence · связь с ADERVIS CRM
--
-- Брифы, которые клиенты заполняют по ссылке CRM, приходят сюда заявкой и
-- брифом; номер брифа CRM — crm_id, чтобы не завести его дважды. Вход в CRM
-- (почта и пароль владельца) — в channel_secrets: записать из приложения можно,
-- прочитать — только серверу.

alter table public.channel_secrets drop constraint if exists channel_secrets_name_check;
alter table public.channel_secrets add constraint channel_secrets_name_check
  check (name in ('tg_bot_token', 'tg_webhook_secret', 'vk_token', 'vk_confirmation', 'vk_secret',
                  'ig_page_token', 'ig_verify_token', 'ig_app_secret', 'intel_webhook_secret', 'digest_secret',
                  'crm_email', 'crm_password'));

alter table public.briefs
  add column if not exists crm_id text unique check (crm_id is null or length(crm_id) <= 64);

alter table public.outreach_settings
  add column if not exists crm_agency_id text not null default '' check (length(crm_agency_id) <= 64),
  add column if not exists crm_login     text not null default '' check (length(crm_login) <= 120),
  add column if not exists crm_last_sync timestamptz,
  -- брифы старше этой отметки не переносим: при подключении — две недели назад
  add column if not exists crm_since     timestamptz;
