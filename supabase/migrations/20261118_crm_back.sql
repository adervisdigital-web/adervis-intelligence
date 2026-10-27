-- Hub ADERVIS · обратная связь из ADERVIS CRM
--
-- Сделка, отправленная из брифа в CRM, живёт дальше там: стадия, сумма, оплаты.
-- Синхронизация (функция crm, раз в 30 минут) переносит это в бриф, чтобы Hub
-- видел реальные деньги. Пишет только сервер; приложение эти поля не отправляет.

alter table public.briefs
  add column if not exists crm_status    text check (crm_status is null or length(crm_status) <= 40),
  add column if not exists crm_total     numeric check (crm_total is null or crm_total >= 0),
  add column if not exists crm_paid      numeric check (crm_paid is null or crm_paid >= 0),
  add column if not exists crm_synced_at timestamptz;
