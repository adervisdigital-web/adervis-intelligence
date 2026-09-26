-- ADERVIS Intelligence · следующий шаг по заявке и компании
--
-- Продажи теряются не на отказах, а на забытых «перезвоню в четверг».
-- У заявки — что сделать дальше и когда, у компании из поиска — когда
-- напомнить о себе. Из этих дат собирается список «На сегодня» на обзоре.

alter table public.leads add column if not exists next_step text not null default ''
  check (length(next_step) <= 200);
alter table public.leads add column if not exists next_on date;
create index if not exists leads_next_idx on public.leads (next_on) where next_on is not null;

alter table public.prospects add column if not exists next_on date;
