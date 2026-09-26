-- ADERVIS Intelligence · бюджет на рекламу
--
-- Приложение уходит от учёта денег к маркетингу. Выручка и расходы студии
-- больше не ведутся здесь; таблицы finance и economics остаются в базе
-- нетронутыми — удалять данные необратимо, это отдельное решение.
--
-- Вместо них — бюджет на рекламу: сколько запланировали и потратили по
-- каналу за месяц. Канал пишется так же, как источник в «Заявках», и
-- поэтому считается цена обращения: потрачено ÷ заявок из этого канала.

create table if not exists public.ad_budget (
  id         text primary key default gen_random_uuid()::text,
  month      date not null,
  channel    text not null check (length(channel) between 1 and 60),
  direction  text not null default 'Студия' check (direction in ('Студия', 'CRM', 'Stock', 'Медиа')),
  planned    integer not null default 0 check (planned >= 0),
  spent      integer not null default 0 check (spent >= 0),
  note       text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (month, channel, direction)
);

create index if not exists ad_budget_month_idx on public.ad_budget (month desc);

drop trigger if exists touch_row on public.ad_budget;
create trigger touch_row before insert or update on public.ad_budget
  for each row execute function public.touch();

drop trigger if exists log_row on public.ad_budget;
create trigger log_row after insert or update or delete on public.ad_budget
  for each row execute function public.log_activity();

alter table public.ad_budget enable row level security;
drop policy if exists members_all on public.ad_budget;
create policy members_all on public.ad_budget for all to authenticated
  using (public.is_member()) with check (public.is_member());

grant select, insert, update, delete on public.ad_budget to authenticated;
grant select, insert, update, delete on public.ad_budget to service_role;
revoke all on public.ad_budget from anon;
