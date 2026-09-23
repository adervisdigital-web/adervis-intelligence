-- ADERVIS Intelligence · этап 3 «ИИ с источниками»
-- Учёт обращений к модели: нужен для дневного лимита и понимания расходов.
-- Пишет только серверная функция, приложение может лишь читать свою статистику.

create table if not exists public.ai_usage (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  actor  text,
  model  text,
  drafts integer not null default 0 check (drafts >= 0),
  chars  integer not null default 0 check (chars >= 0)
);

create index if not exists ai_usage_actor_at_idx on public.ai_usage (actor, at desc);

alter table public.ai_usage enable row level security;

drop policy if exists members_read on public.ai_usage;
create policy members_read on public.ai_usage for select to authenticated using (public.is_member());

grant select on public.ai_usage to authenticated;
revoke all on public.ai_usage from anon;
