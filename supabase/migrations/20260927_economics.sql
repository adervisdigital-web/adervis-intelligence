-- ADERVIS Intelligence · точка безубыточности по направлениям
--
-- Постоянные расходы и средний чек — то, из чего считается порог: сколько
-- клиентов в месяц нужно, чтобы направление перестало быть убыточным.
-- Цифры видны постоянно, а не лежат в документе, о котором вспоминают раз в квартал.

-- Журнал раньше требовал у таблицы колонку id. Здесь ключ — направление,
-- поэтому берём первый подходящий: id, потом direction, потом month.
create or replace function public.log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare row jsonb;
begin
  if tg_op = 'DELETE' then row := to_jsonb(old); else row := to_jsonb(new); end if;
  insert into public.activity (actor, entity, entity_id, action, title)
  values (
    auth.jwt() ->> 'email',
    tg_table_name,
    coalesce(row ->> 'id', row ->> 'direction', row ->> 'month', '—'),
    lower(tg_op),
    left(coalesce(row ->> 'title', row ->> 'direction'), 300)
  );
  return null;
end $$;

create table if not exists public.economics (
  direction   text primary key check (direction in ('Студия', 'CRM', 'Stock', 'Медиа')),
  fixed_costs integer not null default 0 check (fixed_costs >= 0),
  price       integer not null default 0 check (price >= 0),
  note        text not null default '' check (length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

drop trigger if exists touch_row on public.economics;
create trigger touch_row before insert or update on public.economics
  for each row execute function public.touch();

drop trigger if exists log_row on public.economics;
create trigger log_row after insert or update or delete on public.economics
  for each row execute function public.log_activity();

alter table public.economics enable row level security;

drop policy if exists members_all on public.economics;
create policy members_all on public.economics for all to authenticated
  using (public.is_member()) with check (public.is_member());

grant select, insert, update, delete on public.economics to authenticated;
grant select, insert, update, delete on public.economics to service_role;
revoke all on public.economics from anon;

-- Цифры Stock взяты из вашего же расчёта в SALES.md.
insert into public.economics (direction, fixed_costs, price, note) values
('Stock', 4685, 449,
 'Подписка Envato $39 ≈ 3705 ₽ + сервер ≈ 980 ₽. При годовой подписке Envato расходы падают до 2548 ₽, порог — до 6 клиентов.')
on conflict (direction) do nothing;
