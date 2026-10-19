-- ADERVIS Intelligence · брифы и КП
--
-- Работа с заявкой по шагам: ТЗ клиента → разбор → вопросы клиенту → смета
-- (вилка) → план → КП → переговоры → сделка. Бриф привязан к заявке из
-- воронки; шаги брифа двигают её статус. Суммы считаются из часов по ролям
-- и ставок студии — ставки задают владельцы, в ИИ они не уходят.

create table if not exists public.studio_rates (
  id         text primary key check (id ~ '^[a-z0-9_-]{1,20}$'),
  name       text not null check (length(name) between 1 and 60),
  rate       integer not null check (rate between 0 and 100000), -- ₽ за час
  note       text not null default '' check (length(note) <= 200),
  sort       integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Где ставка взята из каталога Adervis CRM — так и написано; остальное —
-- ориентир, который владельцам нужно подтвердить.
insert into public.studio_rates (id, name, rate, note, sort) values
  ('art',      'Арт-директор, концепция',  2000, 'Ориентир — проверьте', 10),
  ('motion',   'Моушн-дизайнер',           1700, 'Ориентир по ставке монтажёра в каталоге CRM — проверьте', 20),
  ('3d',       '3D-художник',              2000, 'Ориентир — проверьте', 30),
  ('design',   'Дизайнер',                 1500, 'Ориентир — проверьте', 40),
  ('editor',   'Монтажёр',                 1700, 'Каталог CRM: 10 000 ₽ за смену', 50),
  ('operator', 'Оператор',                 1500, 'Каталог CRM: 9 000 ₽ за смену', 60),
  ('director', 'Режиссёр',                 1500, 'Каталог CRM: 9 000 ₽ за смену', 70),
  ('sound',    'Звук и музыка',            1500, 'Ориентир — проверьте', 80),
  ('pm',       'Ведение проекта',           700, 'Каталог CRM: продюсер 5 000 ₽ за день', 90)
on conflict (id) do nothing;

create table if not exists public.briefs (
  id          text primary key default gen_random_uuid()::text,
  lead_id     text references public.leads(id) on delete set null,
  title       text not null check (length(title) between 1 and 200),
  client      text not null default '' check (length(client) <= 200),
  stage       text not null default 'Разбор'
              check (stage in ('Разбор', 'Вопросы', 'Расчёт', 'КП', 'Переговоры', 'Сделка', 'Отказ')),
  source_text text not null default '' check (length(source_text) <= 60000),
  -- разбор: суть, цель, аудитория, что сдаём, риски, чего нет в ТЗ
  analysis    jsonb not null default '{}'::jsonb check (length(analysis::text) <= 40000),
  -- [{q, why, status: 'новый' | 'задан' | 'ответ', answer}]
  questions   jsonb not null default '[]'::jsonb check (length(questions::text) <= 30000),
  -- {items: [{group, name, role, min, max, base}], options: [...], reserve: %, round: ₽}
  estimate    jsonb not null default '{}'::jsonb check (length(estimate::text) <= 60000),
  -- [{stage, days, result}]
  plan        jsonb not null default '[]'::jsonb check (length(plan::text) <= 20000),
  -- {intro, price_full, price_base, prepay, revisions, valid_days, terms, sent_on}
  kp          jsonb not null default '{}'::jsonb check (length(kp::text) <= 30000),
  next_step   text not null default '' check (length(next_step) <= 300),
  next_on     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists briefs_lead_idx on public.briefs (lead_id);

do $$
declare t text;
begin
  foreach t in array array['studio_rates', 'briefs'] loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format('create trigger touch_row before insert or update on public.%I for each row execute function public.touch()', t);
    execute format('drop trigger if exists log_row on public.%I', t);
    execute format('create trigger log_row after insert or update or delete on public.%I for each row execute function public.log_activity()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists members_all on public.%I', t);
    execute format('create policy members_all on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
