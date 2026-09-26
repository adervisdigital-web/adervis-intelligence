-- ADERVIS Intelligence · воронка продаж, цели метрик, поиск клиентов
--
-- 1. Воронка. У заявки появляется этап «КП отправлено» и поле reached —
--    дальний этап, до которого она дошла. Без него отказ на этапе КП и
--    отказ сразу после звонка неразличимы, и воронка врёт о том, где теряем.
-- 2. Цели по метрикам: план, с которым сравнивается факт.
-- 3. Поиск клиентов: компании, которым мы сами пишем, и их путь до заявки.

-- 1. воронка ------------------------------------------------------------
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('Новое', 'В работе', 'КП отправлено', 'Сделка', 'Отказ', 'Пропало'));

-- 0 — новое, 1 — в работе, 2 — КП отправлено, 3 — сделка
alter table public.leads add column if not exists reached smallint not null default 0
  check (reached between 0 and 3);
update public.leads set reached = case status
  when 'Сделка' then 3 when 'КП отправлено' then 2 when 'В работе' then 1 else reached end
  where reached = 0;

-- 2. цели метрик --------------------------------------------------------
-- id — ключ метрики из приложения (leads, cpl, conversion…)
create table if not exists public.kpi_targets (
  id         text primary key check (id ~ '^[a-z_]{2,40}$'),
  target     numeric not null check (target >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- 3. поиск клиентов -----------------------------------------------------
create table if not exists public.prospects (
  id          text primary key default gen_random_uuid()::text,
  name        text not null check (length(name) between 1 and 200),
  city        text not null default '' check (length(city) <= 80),
  category    text not null default '' check (length(category) <= 120),
  address     text not null default '' check (length(address) <= 300),
  website     text not null default '' check (length(website) <= 300),
  phone       text not null default '' check (length(phone) <= 200),
  email       text not null default '' check (length(email) <= 200),
  socials     text not null default '' check (length(socials) <= 1000),
  direction   text not null default 'Студия' check (direction in ('Студия', 'CRM', 'Stock', 'Медиа')),
  source      text not null default 'Вручную' check (length(source) between 1 and 40),
  status      text not null default 'Найден'
              check (status in ('Найден', 'Изучили', 'Написали', 'Ответили', 'Заявка', 'Не интересно')),
  external_id text not null default '' check (length(external_id) <= 80),
  lead_id     text references public.leads(id) on delete set null,
  note        text not null default '' check (length(note) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists prospects_status_idx on public.prospects (status, updated_at desc);

-- общие правила: отметка времени, журнал, доступ только своим ---------
do $$
declare t text;
begin
  foreach t in array array['kpi_targets', 'prospects'] loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format('create trigger touch_row before insert or update on public.%I for each row execute function public.touch()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists members_all on public.%I', t);
    execute format('create policy members_all on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  -- в журнал — только то, что люди меняют осмысленно; галочки не пишем
  foreach t in array array['prospects'] loop
    execute format('drop trigger if exists log_row on public.%I', t);
    execute format('create trigger log_row after insert or update or delete on public.%I for each row execute function public.log_activity()', t);
  end loop;
end $$;
