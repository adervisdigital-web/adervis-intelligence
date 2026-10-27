-- Hub ADERVIS · новые студии в ADERVIS CRM → сообщения руководителям
--
-- Синхронизация с CRM (функция crm, раз в 30 минут) смотрит список регистраций
-- CRM и пишет в Telegram: новая студия, итог её первого дня, завтра конец
-- пробного периода. Здесь — кому уже писали, чтобы не повторяться.
-- Пустой seen при первом запуске = запомнить всех без сообщений.

alter table public.outreach_settings
  add column if not exists crm_watch jsonb not null default '{}'::jsonb;
