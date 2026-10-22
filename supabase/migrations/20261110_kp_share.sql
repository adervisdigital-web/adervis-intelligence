-- ADERVIS Intelligence · КП-ссылка для клиента
--
-- Руководитель публикует КП из брифа: в kp_shares ложится снимок того, что
-- видит клиент (без часов и ставок студии), под случайным токеном. Страница
-- kp.html получает его через функцию kp — она же считает просмотры и пишет
-- руководителям в Telegram, когда клиент открыл ссылку. Картинки и видео
-- примеров — в публичном хранилище kp-media: путь к ним знает только КП.

create table if not exists public.kp_shares (
  token         text primary key check (token ~ '^[A-Za-z0-9]{20,40}$'),
  brief_id      text not null references public.briefs(id) on delete cascade,
  data          jsonb not null,
  views         integer not null default 0,
  first_view_at timestamptz,
  last_view_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    text
);
create index if not exists kp_shares_brief_idx on public.kp_shares (brief_id);

drop trigger if exists touch_row on public.kp_shares;
create trigger touch_row before insert or update on public.kp_shares for each row execute function public.touch();
alter table public.kp_shares enable row level security;
drop policy if exists members_all on public.kp_shares;
create policy members_all on public.kp_shares for all to authenticated using (public.is_member()) with check (public.is_member());
grant select, insert, update, delete on public.kp_shares to authenticated;
grant select, insert, update, delete on public.kp_shares to service_role;
revoke all on public.kp_shares from anon;

-- Публичное хранилище примеров: читать может любой по ссылке, класть и
-- удалять — только руководители. Файл до 50 МБ.
insert into storage.buckets (id, name, public, file_size_limit)
values ('kp-media', 'kp-media', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

drop policy if exists kp_media_add on storage.objects;
create policy kp_media_add on storage.objects for insert to authenticated
  with check (bucket_id = 'kp-media' and public.is_member());
drop policy if exists kp_media_change on storage.objects;
create policy kp_media_change on storage.objects for update to authenticated
  using (bucket_id = 'kp-media' and public.is_member()) with check (bucket_id = 'kp-media' and public.is_member());
drop policy if exists kp_media_remove on storage.objects;
create policy kp_media_remove on storage.objects for delete to authenticated
  using (bucket_id = 'kp-media' and public.is_member());
drop policy if exists kp_media_list on storage.objects;
create policy kp_media_list on storage.objects for select to authenticated
  using (bucket_id = 'kp-media' and public.is_member());
