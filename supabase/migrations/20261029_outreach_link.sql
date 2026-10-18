-- ADERVIS Intelligence · привязка менеджера к боту по коду
--
-- В приложении — шестизначный код на 15 минут; менеджер отправляет боту
-- «/link 123456», и бот запоминает его чат для уведомлений о заявках.

alter table public.outreach_settings
  add column if not exists link_code         text not null default '' check (link_code ~ '^(\d{6})?$'),
  add column if not exists link_code_expires timestamptz;
