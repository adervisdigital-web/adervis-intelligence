-- ADERVIS Intelligence · бриф со сметой → сделка в ADERVIS CRM
--
-- Номер сделки в CRM — чтобы повторная отправка обновляла ту же сделку,
-- а не заводила вторую. Ставит только сервер (функция crm).

alter table public.briefs
  add column if not exists crm_deal_id   text check (crm_deal_id is null or length(crm_deal_id) <= 80),
  add column if not exists crm_pushed_at timestamptz;
