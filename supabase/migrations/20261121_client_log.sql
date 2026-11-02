-- Hub ADERVIS · журнал клиента
--
-- Кто, что, когда и с кем договорился: записи по заявке. Договорённости больше
-- не теряются в мессенджерах и видны обоим руководителям. Удаление заявки
-- удаляет и её журнал.

create table if not exists public.client_log (
  id text primary key default gen_random_uuid()::text,
  lead_id text not null references public.leads(id) on delete cascade,
  on_date date not null default current_date,
  who text not null default '',
  contact text not null default '',
  channel text not null default '',
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists client_log_lead on public.client_log (lead_id, on_date desc);

drop trigger if exists touch_row on public.client_log;
create trigger touch_row before insert or update on public.client_log
  for each row execute function public.touch();
drop trigger if exists log_row on public.client_log;
create trigger log_row after insert or update or delete on public.client_log
  for each row execute function public.log_activity();

alter table public.client_log enable row level security;
drop policy if exists members_all on public.client_log;
create policy members_all on public.client_log for all to authenticated
  using (public.is_member()) with check (public.is_member());
grant select, insert, update, delete on public.client_log to authenticated;
grant select, insert, update, delete on public.client_log to service_role;
revoke all on public.client_log from anon;
