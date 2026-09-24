-- ADERVIS Intelligence · публикация в каналы
--
-- История отправок: что, куда, когда и кем опубликовано. Нужна, чтобы
-- не отправить дважды и чтобы замеры результата было к чему привязывать.

create table if not exists public.publications (
  id         text primary key default gen_random_uuid()::text,
  post       text not null references public.content(id) on delete cascade,
  channel    text not null check (length(channel) between 1 and 40),
  at         timestamptz not null default now(),
  actor      text,
  external_id text,
  url        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists publications_post_idx on public.publications (post, at desc);

drop trigger if exists touch_row on public.publications;
create trigger touch_row before insert or update on public.publications
  for each row execute function public.touch();

alter table public.publications enable row level security;

-- Читать могут свои. Записывает только серверная функция служебным ключом:
-- отметка о публикации не должна появляться из браузера без настоящей отправки.
drop policy if exists members_read on public.publications;
create policy members_read on public.publications for select to authenticated using (public.is_member());

grant select on public.publications to authenticated;
grant select, insert, delete on public.publications to service_role;
revoke all on public.publications from anon;
