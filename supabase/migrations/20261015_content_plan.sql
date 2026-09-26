-- ADERVIS Intelligence · контент-план по площадкам и аккаунты для парсера
--
-- 1. Одно название площадки на всё приложение. В контенте было «VK», в
--    рекламе и заявках «ВКонтакте» — связи между разделами по названию
--    из-за этого не сходились.
-- 2. У публикации появляется адрес реального поста: его ставит парсер,
--    когда находит пост в канале, или человек руками.
-- 3. Аккаунты площадок: откуда парсер берёт вышедшие посты.

update public.content set channel = 'ВКонтакте' where channel in ('VK', 'Вконтакте', 'vk');

alter table public.content add column if not exists url text not null default ''
  check (length(url) <= 500);

create table if not exists public.social_accounts (
  network    text primary key check (length(network) between 1 and 40),
  handle     text not null default '' check (length(handle) <= 120),
  note       text not null default '' check (length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

drop trigger if exists touch_row on public.social_accounts;
create trigger touch_row before insert or update on public.social_accounts
  for each row execute function public.touch();

alter table public.social_accounts enable row level security;
drop policy if exists members_all on public.social_accounts;
create policy members_all on public.social_accounts for all to authenticated
  using (public.is_member()) with check (public.is_member());

grant select, insert, update, delete on public.social_accounts to authenticated;
grant select, insert, update, delete on public.social_accounts to service_role;
revoke all on public.social_accounts from anon;

-- Аккаунты, найденные при проверке цифрового следа 25.09.2026.
insert into public.social_accounts (network, handle, note) values
  ('Telegram', 'Adervis_digital', 'Публичный канал: посты и просмотры читаются без ключей'),
  ('YouTube', 'UCwL-PkN9Jul92VJm5gFgY-Q', 'Канал ADERVIS | digital agency: лента роликов без ключей'),
  ('ВКонтакте', 'adervis_digital', 'Сообщество. Для чтения стены нужен сервисный ключ VK')
on conflict (network) do nothing;
