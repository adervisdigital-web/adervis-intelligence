-- Как клиент читал КП: визиты со временем, разделами, роликом и скачиванием
-- сметы. Пишет функция kp по сигналам страницы, читают руководители.
alter table public.kp_shares add column if not exists engagement jsonb not null default '{}'::jsonb;
