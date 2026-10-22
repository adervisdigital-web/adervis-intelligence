-- ADERVIS Intelligence · приём заявок через служебного бота
--
-- Руководитель пересылает боту материалы клиента; каждый кусок — строка
-- (так параллельные пересылки не затирают друг друга). По «Разобрать» бот
-- собирает их в бриф и удаляет. Доступ — только у сервера.

create table if not exists public.bot_intake_items (
  id         bigint generated always as identity primary key,
  chat_id    bigint not null,
  msg_id     bigint not null,
  kind       text not null check (length(kind) <= 20),
  name       text not null default '' check (length(name) <= 200),
  text       text not null default '' check (length(text) <= 60000),
  sender     text not null default '' check (length(sender) <= 80),
  created_at timestamptz not null default now(),
  unique (chat_id, msg_id)
);
alter table public.bot_intake_items enable row level security;
revoke all on public.bot_intake_items from anon, authenticated;
