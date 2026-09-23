-- ADERVIS Intelligence · этап 1 «Общая база»
-- Выполняется один раз в SQL Editor проекта Supabase.
--
-- Правило доступа одно: работать с данными может только тот, чья почта есть
-- в таблице members. Для всех остальных, включая неавторизованных, таблицы пусты.

-- ---------------------------------------------------------------- участники

create table if not exists public.members (
  email      text primary key check (email = lower(email) and position('@' in email) > 1),
  name       text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

-- Проверка «свой ли это человек». security definer — функция читает members
-- в обход политик доступа, иначе политика на самой members ссылалась бы на себя.
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- ------------------------------------------------------------------- данные

create table if not exists public.knowledge (
  id         text primary key default gen_random_uuid()::text,
  title      text not null check (length(title) between 1 and 300),
  body       text not null check (length(body) between 1 and 20000),
  category   text not null check (length(category) between 1 and 60),
  source     text not null default '' check (length(source) <= 1000),
  access     text not null check (access in ('Публичное', 'Внутреннее')),
  status     text not null check (status in ('Черновик', 'Со слов команды', 'Публичный источник', 'Подтверждено', 'Требует проверки')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.content (
  id         text primary key default gen_random_uuid()::text,
  title      text not null check (length(title) between 1 and 300),
  body       text not null check (length(body) between 1 and 20000),
  product    text not null check (length(product) between 1 and 60),
  author     text not null check (length(author) between 1 and 60),
  channel    text not null check (length(channel) between 1 and 60),
  status     text not null check (status in ('Идея', 'Черновик', 'На проверке', 'Утверждено', 'Опубликовано')),
  publish_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.tasks (
  id         text primary key default gen_random_uuid()::text,
  title      text not null check (length(title) between 1 and 300),
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Замер результата публикации. Удаляется вместе с публикацией.
create table if not exists public.metrics (
  id          text primary key default gen_random_uuid()::text,
  post        text not null references public.content(id) on delete cascade,
  measured_on date not null,
  views       integer not null check (views >= 0),
  replies     integer not null check (replies >= 0),
  leads       integer not null check (leads >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create index if not exists metrics_post_idx on public.metrics (post);

-- Журнал: кто и что менял. Пишется триггерами, руками не правится.
create table if not exists public.activity (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor     text,
  entity    text not null,
  entity_id text not null,
  action    text not null check (action in ('insert', 'update', 'delete')),
  title     text
);

create index if not exists activity_at_idx on public.activity (at desc);

-- ---------------------------------------------------------------- триггеры

create or replace function public.touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.jwt() ->> 'email';
  return new;
end $$;

create or replace function public.log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare row jsonb;
begin
  if tg_op = 'DELETE' then row := to_jsonb(old); else row := to_jsonb(new); end if;
  insert into public.activity (actor, entity, entity_id, action, title)
  values (auth.jwt() ->> 'email', tg_table_name, row ->> 'id', lower(tg_op), left(row ->> 'title', 300));
  return null;
end $$;

-- ------------------------------------------------- триггеры, RLS и политики

do $$
declare t text;
begin
  foreach t in array array['knowledge', 'content', 'tasks', 'metrics'] loop
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

    -- Доступ выдаём явно: в проекте выключено автоматическое открытие таблиц.
    -- Что именно можно вошедшему, решают политики выше.
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Журнал и список участников доступны только на чтение и только своим.
alter table public.activity enable row level security;
drop policy if exists members_read on public.activity;
create policy members_read on public.activity for select to authenticated using (public.is_member());
grant select on public.activity to authenticated;
revoke all on public.activity from anon;

alter table public.members enable row level security;
drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (public.is_member());
grant select on public.members to authenticated;
revoke all on public.members from anon;
