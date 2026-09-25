-- ADERVIS Intelligence · учёт обращений
--
-- Без этого раздела решения нечем проверять: мы записали, что заведём
-- карточку в 2ГИС и позовём студии через амбассадоров, но узнать,
-- принесло ли это заявки, было негде.
--
-- Нарочно просто: кто обратился, откуда узнал, чего хотел, чем кончилось.
-- Это не вторая CRM — сделки ведутся в CRM, здесь считаются источники.

create table if not exists public.leads (
  id         text primary key default gen_random_uuid()::text,
  came_on    date not null default current_date,
  name       text not null check (length(name) between 1 and 200),
  source     text not null default 'Не знаем' check (length(source) between 1 and 60),
  direction  text not null default 'Студия' check (direction in ('Студия', 'CRM', 'Stock', 'Медиа')),
  request    text not null default '' check (length(request) <= 1000),
  amount     integer not null default 0 check (amount >= 0),
  status     text not null default 'Новое'
             check (status in ('Новое', 'В работе', 'Сделка', 'Отказ', 'Пропало')),
  note       text not null default '' check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists leads_came_idx on public.leads (came_on desc);
create index if not exists leads_source_idx on public.leads (source, status);

drop trigger if exists touch_row on public.leads;
create trigger touch_row before insert or update on public.leads
  for each row execute function public.touch();

drop trigger if exists log_row on public.leads;
create trigger log_row after insert or update or delete on public.leads
  for each row execute function public.log_activity();

alter table public.leads enable row level security;
drop policy if exists members_all on public.leads;
create policy members_all on public.leads for all to authenticated
  using (public.is_member()) with check (public.is_member());

grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.leads to service_role;
revoke all on public.leads from anon;
