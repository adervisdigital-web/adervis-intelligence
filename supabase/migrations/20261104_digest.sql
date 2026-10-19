-- ADERVIS Intelligence · утренняя сводка «На сегодня» в Telegram
--
-- Служебный бот @adervis_intel_bot каждое утро присылает руководителям
-- дела на сегодня. Подписка — по ссылке с кодом из приложения; по
-- команде /today — сводка в любой момент, /stop — отписаться.
-- Расписание (pg_cron) лежит в supabase/cron/digest.sql: в тестовой базе
-- расширений pg_cron и pg_net нет.

create table if not exists public.digest_subscribers (
  chat_id    bigint primary key,
  name       text not null default '' check (length(name) <= 120),
  hour       smallint not null default 9 check (hour between 0 and 23), -- по Перми
  last_sent  date,
  created_at timestamptz not null default now()
);
alter table public.digest_subscribers enable row level security;
drop policy if exists members_all on public.digest_subscribers;
create policy members_all on public.digest_subscribers for all to authenticated
  using (public.is_member()) with check (public.is_member());
grant select, update, delete on public.digest_subscribers to authenticated;
grant select, insert, update, delete on public.digest_subscribers to service_role;
revoke all on public.digest_subscribers from anon;

alter table public.outreach_settings
  add column if not exists digest_code         text not null default '' check (digest_code ~ '^(\d{6})?$'),
  add column if not exists digest_code_expires timestamptz,
  add column if not exists intel_bot_username  text not null default '' check (length(intel_bot_username) <= 64);

-- секреты служебного бота и расписания — рядом с ключами каналов
alter table public.channel_secrets drop constraint if exists channel_secrets_name_check;
alter table public.channel_secrets add constraint channel_secrets_name_check
  check (name in ('tg_bot_token', 'tg_webhook_secret', 'vk_token', 'vk_confirmation', 'vk_secret',
                  'ig_page_token', 'ig_verify_token', 'ig_app_secret', 'intel_webhook_secret', 'digest_secret'));
insert into public.channel_secrets (name, value)
values ('digest_secret', md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text))
on conflict (name) do nothing;
