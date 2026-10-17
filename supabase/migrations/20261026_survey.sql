-- ADERVIS Intelligence · анкета для владельцев
--
-- Ответы на вопросы о компании и приложении. Номер строки — номер вопроса
-- («3.2»), ответ — выбранные варианты и уточнения. Сохраняется сразу при
-- выборе, без кнопки «Сохранить». В журнал не пишется: это черновик ответов.

create table if not exists public.survey_answers (
  id         text primary key check (id ~ '^\d{1,2}\.\d{1,2}$'),
  answer     jsonb not null default '{}'::jsonb check (length(answer::text) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

drop trigger if exists touch_row on public.survey_answers;
create trigger touch_row before insert or update on public.survey_answers
  for each row execute function public.touch();

alter table public.survey_answers enable row level security;
drop policy if exists members_all on public.survey_answers;
create policy members_all on public.survey_answers for all to authenticated
  using (public.is_member()) with check (public.is_member());
grant select, insert, update, delete on public.survey_answers to authenticated;
grant select, insert, update, delete on public.survey_answers to service_role;
revoke all on public.survey_answers from anon;
