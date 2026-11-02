-- Hub ADERVIS · слежение за Adervis Stock и облаком рег.ру
--
-- Расписание раз в 15 минут проверяет сайт Stock и баланс облака: снимок за день
-- копит историю, тревоги уходят в Telegram руководителям. stock_cloud: баланс,
-- записанный вручную, пока не подключён ключ API облака; stock_watch: о чём уже
-- предупредили, чтобы не повторяться.

create table if not exists public.stock_snapshots (
  day date primary key,
  at timestamptz not null default now(),
  state text not null default '',
  data jsonb,
  cloud jsonb
);
alter table public.stock_snapshots enable row level security;
drop policy if exists members_read on public.stock_snapshots;
create policy members_read on public.stock_snapshots for select to authenticated using (public.is_member());
grant select on public.stock_snapshots to authenticated;
grant select, insert, update, delete on public.stock_snapshots to service_role;
revoke all on public.stock_snapshots from anon;

alter table public.outreach_settings
  add column if not exists stock_cloud jsonb not null default '{}'::jsonb,
  add column if not exists stock_watch jsonb not null default '{}'::jsonb;
