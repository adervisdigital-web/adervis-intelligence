-- ADERVIS Intelligence · контуры «Деньги» и «Решения»
--
-- Деньги: помесячные цифры по направлениям. Без них любой совет —
-- угадывание. Данные внутренние: в тексты и в запросы к ИИ они не уходят,
-- потому что серверная функция читает только таблицу knowledge.
--
-- Решения: что решили, почему, по какому признаку поймём, что сработало.
-- Иначе через месяц не восстановить, почему сделали именно так.

create table if not exists public.finance (
  id         text primary key default gen_random_uuid()::text,
  month      date not null,
  direction  text not null check (direction in ('Студия', 'CRM', 'Stock', 'Медиа')),
  revenue    integer not null default 0 check (revenue >= 0),
  costs      integer not null default 0 check (costs >= 0),
  projects   integer not null default 0 check (projects >= 0),
  shoot_days integer not null default 0 check (shoot_days >= 0),
  note       text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (month, direction)
);

create index if not exists finance_month_idx on public.finance (month desc);

create table if not exists public.decisions (
  id         text primary key default gen_random_uuid()::text,
  title      text not null check (length(title) between 1 and 300),
  why        text not null default '' check (length(why) <= 4000),
  measure    text not null default '' check (length(measure) <= 500),
  outcome    text not null default '' check (length(outcome) <= 4000),
  status     text not null default 'Делаем'
             check (status in ('Думаем', 'Делаем', 'Проверяем', 'Сработало', 'Не сработало', 'Отменено')),
  decided_on date not null default current_date,
  due_on     date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists decisions_status_idx on public.decisions (status, decided_on desc);

do $$
declare t text;
begin
  foreach t in array array['finance', 'decisions'] loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format('create trigger touch_row before insert or update on public.%I
                    for each row execute function public.touch()', t);

    execute format('drop trigger if exists log_row on public.%I', t);
    execute format('create trigger log_row after insert or update or delete on public.%I
                    for each row execute function public.log_activity()', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists members_all on public.%I', t);
    execute format('create policy members_all on public.%I for all to authenticated
                    using (public.is_member()) with check (public.is_member())', t);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
