-- ADERVIS Intelligence · этап 4 «Файлы»
--
-- Брендбук, фото и видео кейсов, документы — вложениями к записям базы знаний.
-- Сами файлы лежат в закрытом хранилище: прямая ссылка без входа не работает,
-- приложение выдаёт временные ссылки вошедшему человеку.

create table if not exists public.files (
  id         text primary key default gen_random_uuid()::text,
  record     text not null references public.knowledge(id) on delete cascade,
  name       text not null check (length(name) between 1 and 300),
  path       text not null unique check (length(path) between 1 and 500),
  mime       text not null default '' check (length(mime) <= 200),
  size       integer not null check (size >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists files_record_idx on public.files (record);

drop trigger if exists touch_row on public.files;
create trigger touch_row before insert or update on public.files
  for each row execute function public.touch();

drop trigger if exists log_row on public.files;
create trigger log_row after insert or update or delete on public.files
  for each row execute function public.log_activity();

alter table public.files enable row level security;

drop policy if exists members_all on public.files;
create policy members_all on public.files for all to authenticated
  using (public.is_member()) with check (public.is_member());

grant select, insert, update, delete on public.files to authenticated;
grant select, insert, update, delete on public.files to service_role;
revoke all on public.files from anon;

-- ------------------------------------------------------------- хранилище

-- Закрытое хранилище: публичных ссылок нет, файл до 50 МБ.
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Построчная защита на storage.objects в Supabase включена изначально,
-- поэтому здесь только политики доступа.

drop policy if exists files_members_read on storage.objects;
create policy files_members_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.is_member());

drop policy if exists files_members_add on storage.objects;
create policy files_members_add on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.is_member());

drop policy if exists files_members_change on storage.objects;
create policy files_members_change on storage.objects for update to authenticated
  using (bucket_id = 'files' and public.is_member()) with check (bucket_id = 'files' and public.is_member());

drop policy if exists files_members_remove on storage.objects;
create policy files_members_remove on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.is_member());
