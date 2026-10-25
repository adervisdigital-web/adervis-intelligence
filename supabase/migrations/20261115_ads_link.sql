-- Рекламные кабинеты: VK Реклама и Яндекс Директ. Функция ads-sync раз в
-- сутки и по кнопке забирает расход, показы и клики по кампаниям за 30 дней
-- в ad_stats; кампания Hub, связанная с кампанией кабинета (ext_network +
-- ext_id), получает расход оттуда. Ключи кабинетов — в channel_secrets.

alter table public.channel_secrets drop constraint if exists channel_secrets_name_check;
alter table public.channel_secrets add constraint channel_secrets_name_check
  check (name in ('tg_bot_token', 'tg_webhook_secret', 'vk_token', 'vk_confirmation', 'vk_secret',
                  'ig_page_token', 'ig_verify_token', 'ig_app_secret', 'intel_webhook_secret', 'digest_secret',
                  'crm_email', 'crm_password', 'stock_hub_token',
                  'vkads_client_id', 'vkads_client_secret', 'vkads_token', 'yadirect_token', 'yadirect_login'));

create table if not exists public.ad_stats (
  network     text not null check (network in ('vk', 'direct')),
  ext_id      text not null check (length(ext_id) between 1 and 40),
  day         date not null,
  name        text not null default '' check (length(name) <= 300),
  spent       numeric(14, 2) not null default 0,
  impressions integer not null default 0,
  clicks      integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (network, ext_id, day)
);
alter table public.ad_stats enable row level security;
drop policy if exists members_read on public.ad_stats;
create policy members_read on public.ad_stats for select to authenticated using (public.is_member());
grant select on public.ad_stats to authenticated;
grant select, insert, update, delete on public.ad_stats to service_role;
revoke all on public.ad_stats from anon;

alter table public.campaigns
  add column if not exists ext_network text check (ext_network is null or ext_network in ('vk', 'direct')),
  add column if not exists ext_id text check (ext_id is null or length(ext_id) <= 40);

-- состояние последней выгрузки по каждому кабинету
alter table public.outreach_settings
  add column if not exists ads_sync jsonb not null default '{}'::jsonb;
