-- ADERVIS Intelligence · холодные продажи и переписка (бывший ADERVIS OTR)
--
-- OTR переезжает в Intelligence. Собеседник из ВКонтакте, Telegram или
-- Instagram — это компания в «Поиске клиентов», его переписка — таблица
-- messages, заполненный в боте бриф — заявка в воронке продаж.
--
-- Что сделано иначе, чем в OTR:
-- 1. Сообщения — отдельная таблица, а не массив внутри лида: два сообщения,
--    пришедшие одновременно, больше не затирают друг друга.
-- 2. Ключи ботов лежат в channel_secrets: из приложения их можно записать,
--    но нельзя прочитать — читают только серверные функции.
-- 3. Журнал изменений пишет действия людей; то, что делает бот, в журнал
--    не попадает, иначе он утонет во входящих сообщениях.

-- журнал: только люди; название берём и из name ------------------------
create or replace function public.log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare row jsonb;
begin
  if coalesce(auth.jwt() ->> 'email', '') = '' then return null; end if;
  if tg_op = 'DELETE' then row := to_jsonb(old); else row := to_jsonb(new); end if;
  insert into public.activity (actor, entity, entity_id, action, title)
  values (
    auth.jwt() ->> 'email',
    tg_table_name,
    coalesce(row ->> 'id', row ->> 'direction', row ->> 'month', '—'),
    lower(tg_op),
    left(coalesce(row ->> 'title', row ->> 'name', row ->> 'direction'), 300)
  );
  return null;
end $$;

-- собеседник = компания «Поиска клиентов» -------------------------------
alter table public.prospects
  add column if not exists vk_peer_id       bigint,
  add column if not exists tg_chat_id       bigint,
  add column if not exists ig_user_id       text,
  add column if not exists bot_mode         text not null default 'bot'
    check (bot_mode in ('bot', 'human')),
  add column if not exists bot_state        jsonb not null default '{}'::jsonb,
  add column if not exists ab_variant       text check (ab_variant in ('A', 'B')),
  add column if not exists service_category text not null default '' check (length(service_category) <= 20),
  add column if not exists deal_score       integer check (deal_score between 1 and 100),
  add column if not exists deal_score_reason text not null default '' check (length(deal_score_reason) <= 300),
  add column if not exists attempt_count    integer not null default 0 check (attempt_count >= 0),
  add column if not exists last_message_at  timestamptz,
  add column if not exists unread           integer not null default 0 check (unread >= 0),
  add column if not exists reminded_at      timestamptz;

create unique index if not exists prospects_vk_peer_uq on public.prospects (vk_peer_id) where vk_peer_id is not null;
create unique index if not exists prospects_tg_chat_uq on public.prospects (tg_chat_id) where tg_chat_id is not null;
create unique index if not exists prospects_ig_user_uq on public.prospects (ig_user_id) where ig_user_id is not null;
create index if not exists prospects_last_msg_idx on public.prospects (last_message_at desc nulls last);

-- сообщения ---------------------------------------------------------------
create table if not exists public.messages (
  id          text primary key default gen_random_uuid()::text,
  prospect_id text not null references public.prospects(id) on delete cascade,
  channel     text not null check (channel in ('ВКонтакте', 'Telegram', 'Instagram', 'Заметка')),
  direction   text not null check (direction in ('in', 'out')),
  -- кто написал исходящее: человек (почта), бот или ИИ
  author      text not null default '' check (length(author) <= 120),
  kind        text not null default 'text'
              check (kind in ('text', 'button', 'brief_answer', 'brief_complete', 'system', 'reminder', 'ai', 'voice')),
  text        text not null default '' check (length(text) <= 8000),
  meta        jsonb not null default '{}'::jsonb,
  external_id text not null default '' check (length(external_id) <= 120),
  created_at  timestamptz not null default now()
);
create index if not exists messages_prospect_idx on public.messages (prospect_id, created_at);

alter table public.messages enable row level security;
drop policy if exists members_all on public.messages;
create policy members_all on public.messages for all to authenticated
  using (public.is_member()) with check (public.is_member());
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.messages to service_role;
revoke all on public.messages from anon;

-- новое сообщение поднимает диалог наверх и считает непрочитанные --------
create or replace function public.message_touch_prospect() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.prospects
     set last_message_at = new.created_at,
         unread = case when new.direction = 'in' then unread + 1 else unread end
   where id = new.prospect_id;
  return null;
end $$;
drop trigger if exists message_touch on public.messages;
create trigger message_touch after insert on public.messages
  for each row execute function public.message_touch_prospect();

-- настройки ботов и скриптов (одна строка) --------------------------------
create table if not exists public.outreach_settings (
  id                text primary key default 'main' check (id = 'main'),
  tg_bot_username   text not null default '' check (length(tg_bot_username) <= 64),
  tg_welcome_text   text not null default '' check (length(tg_welcome_text) <= 2000),
  tg_welcome_text_b text not null default '' check (length(tg_welcome_text_b) <= 2000),
  tg_ab_enabled     boolean not null default false,
  portfolio_text    text not null default '' check (length(portfolio_text) <= 2000),
  portfolio_videos  jsonb not null default '[]'::jsonb,
  brief_questions   jsonb not null default '[]'::jsonb,
  ai_enabled        boolean not null default true,
  ai_extra          text not null default '' check (length(ai_extra) <= 3000),
  quick_replies     jsonb not null default '[]'::jsonb,
  reminder_enabled  boolean not null default false,
  reminder_text     text not null default '' check (length(reminder_text) <= 1000),
  vk_community_id   bigint,
  vk_welcome_text   text not null default '' check (length(vk_welcome_text) <= 2000),
  vk_followup_text  text not null default '' check (length(vk_followup_text) <= 1000),
  manager_chat_id   bigint,
  cta               jsonb not null default '{}'::jsonb,
  daily_goal        integer not null default 20 check (daily_goal between 0 and 500),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        text
);
insert into public.outreach_settings (id, quick_replies, cta, brief_questions) values ('main',
  '["Отлично!", "Уточните, пожалуйста", "Позвоню сегодня", "Пришлю примеры", "Когда вам удобно?"]'::jsonb,
  '{"call": "Созвон на 5 минут", "call_link": "", "brief": "Короткий бриф", "brief_link": "", "meeting": "Встреча"}'::jsonb,
  '["Расскажите про ваш бизнес — чем занимаетесь и что хотите снять?", "Какой формат видео интересует?", "В каком городе находитесь?", "Ориентировочный бюджет?", "Как вас зовут?", "Телефон или @username для связи?"]'::jsonb)
on conflict (id) do nothing;

-- ключи ботов: записать можно, прочитать — только серверу ----------------
create table if not exists public.channel_secrets (
  name       text primary key check (name in ('tg_bot_token', 'tg_webhook_secret', 'vk_token', 'vk_confirmation',
                                               'vk_secret', 'ig_page_token', 'ig_verify_token', 'ig_app_secret')),
  value      text not null check (length(value) between 1 and 2000),
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.channel_secrets enable row level security;
revoke all on public.channel_secrets from anon, authenticated;
grant select, insert, update, delete on public.channel_secrets to service_role;

create or replace function public.set_channel_secret(p_name text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'Нет доступа'; end if;
  if coalesce(trim(p_value), '') = '' then
    delete from public.channel_secrets where name = p_name;
  else
    insert into public.channel_secrets (name, value, updated_by)
    values (p_name, trim(p_value), auth.jwt() ->> 'email')
    on conflict (name) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  end if;
end $$;

-- какие ключи заданы — без самих значений
create or replace function public.channel_secret_status() returns table (name text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select name, updated_at from public.channel_secrets where public.is_member();
$$;

revoke execute on function public.set_channel_secret(text, text) from public, anon;
revoke execute on function public.channel_secret_status() from public, anon;
grant execute on function public.set_channel_secret(text, text) to authenticated;
grant execute on function public.channel_secret_status() to authenticated;

-- скрипты продаж ----------------------------------------------------------
create table if not exists public.sales_scripts (
  id         text primary key default gen_random_uuid()::text,
  stage      smallint not null check (stage between 0 and 2),
  title      text not null check (length(title) between 1 and 160),
  body       text not null check (length(body) between 1 and 3000),
  note       text not null default '' check (length(note) <= 300),
  sort       integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

do $$
declare t text;
begin
  foreach t in array array['outreach_settings', 'sales_scripts'] loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format('create trigger touch_row before insert or update on public.%I for each row execute function public.touch()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists members_all on public.%I', t);
    execute format('create policy members_all on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Скрипты из ADERVIS OTR. {rest} — название заведения, {call}/{call_link},
-- {brief}/{brief_link} — подставляются из настроек. Два скрипта с цифрами,
-- которых нет в базе знаний, помечены «проверить».
insert into public.sales_scripts (id, stage, sort, title, body, note) values
('s0-vk-audit', 0, 10, '[ВК] Через аудит (VK Клипы)', 'Добрый день! Изучил вашу группу ВК — у {rest} отличный интерьер и меню, но вы сейчас теряете бесплатный локальный трафик из-за формата видео. Подскажите, с кем из руководства можно обсудить съемку VK Клипов?', ''),
('s0-ig-reels', 0, 20, '[Inst] Через Reels', 'Добрый день! Давно слежу за аккаунтом. В {rest} шикарная атмосфера, но без динамичных Reels сложно расти органически. Подскажите, кто принимает решения по визуальной упаковке профиля?', ''),
('s0-tg-offer', 0, 30, '[TG] Прямой оффер в Telegram', 'Добрый день! Вижу ваш канал — классное заведение. У нас есть связка: короткие видео для Telegram повышают вовлечённость и приводят новых гостей. С кем можно пообщаться?', ''),
('s0-partner', 0, 40, '[Любая площадка] Партнёрский заход', 'Добрый день! Меня зовут Артём, продакшен ADERVIS. Собираем пул топовых заведений города для атмосферных роликов. {rest} отлично подходит по формату. Подскажите, кому скинуть предложение?', ''),
('s0-vk-rivals', 0, 50, '[ВК] Через конкурентов', 'Добрый день! Снимали похожие заведения в вашем районе — видео набирали по 50–200к просмотров в VK Клипах без рекламы. {rest} тоже отлично выглядел бы в этом формате. С кем можно обсудить?', 'Проверить: цифры просмотров должны быть из реального кейса'),
('s0-ig-case', 0, 60, '[Inst] Через кейс', 'Добрый день! Снимали Reels для кафе в вашем районе — за 2 недели +800 подписчиков и рост брони. {rest} думаю тоже выиграл бы от такого контента. Подскажите, кто у вас за соцсети отвечает?', 'Проверить: «+800 подписчиков» должно быть из реального кейса'),
('s0-guests', 0, 70, '[Универсальный] Через гостей', 'Добрый день! Ваши гости точно снимают и выкладывают сторис — но без профессионального контента вы отдаёте инициативу случаю. Помогаем заведениям контролировать свой образ в интернете через короткие видео. Кому скинуть детали?', ''),
('s1-who', 1, 10, '[Кто вы?] Краткий ответ', E'Мы ADERVIS, видеопродакшен. Помогаем заведениям привлекать гостей через короткие видео (VK Клипы / Reels / Shorts).\n\nЧтобы не растягивать переписку: {call} — {call_link}. Удобно сегодня/завтра?', ''),
('s1-examples', 1, 20, '[Примеры работ] Перевод в звонок', E'Да, конечно. Чтобы прислать ровно то, что подойдёт под вашу кухню/формат/аудиторию, проще за 5 минут созвониться и я сразу скину 2–3 релевантных примера.\n\n{call}: {call_link}', ''),
('s1-price', 1, 30, '[Сколько стоит?] Перевод в звонок', E'Зависит от задачи и количества роликов — в переписке легко ошибиться.\n\nДавайте так: {call} — {call_link}. Я задам 3 вопроса и сразу скажу точную вилку и что входит.', ''),
('s1-nocall', 1, 40, '[Без звонков] Скинуть бриф', E'Понял(а). Тогда лучше через {brief}: {brief_link}\n\nПосле брифа пришлю 2 варианта:\n1) быстрый пакет (запустить лидген)\n2) усиленный пакет (выжать максимум)', ''),
('s1-meeting', 1, 50, '[Встреча] Приехать в заведение', E'Да. Если удобнее офлайн — можем заехать в {rest} на 10–15 минут, посмотреть свет/ракурсы и предложить идеи под ваш формат.\n\nКогда удобнее: сегодня вечером или завтра?', ''),
('s1-followup', 1, 60, '[Молчат >24ч] Follow-up', E'Добрый день! Удалось посмотреть?\n\nЕсли сейчас неактуально — ок, просто скажите, чтобы я не отвлекал. Если актуально — самый быстрый шаг: {call} {call_link}', ''),
('s1-later', 1, 70, '[Позже / не сезон] Отложить', E'Понял(а). Чтобы не потеряться: на какую дату лучше вернуться?\n\nМожно пока скинуть {brief} ({brief_link}) — заполните когда удобно, и я подготовлю предложение заранее.', ''),
('s1-details', 1, 80, '[Что входит?] Детали', E'Хороший вопрос. Вот что входит в стандартный пакет:\n— Выезд оператора + режиссёр\n— Съёмка 3–5 коротких роликов (до 60 сек)\n— Монтаж, цвет, субтитры\n— Адаптация под VK Клипы / Reels / Shorts\n\nПо цене — удобнее обсудить голосом: {call} {call_link}', ''),
('s2-smm', 2, 10, '[Свой SMM] Мы не конкуренты', E'Это отлично. Мы усиливаем вашего SMM контентом, который сложно снять на телефон (свет, динамика, продакшен).\n\nКоротко созвониться — чтобы понять стиль и отдать материал, который SMM использует весь месяц.\n\n{call}: {call_link}', ''),
('s2-budget', 2, 20, '[Нет бюджета] Минимальный вход', E'Понимаю. Тогда выберем самый лёгкий вход: 1 съёмка → 3–5 коротких роликов → тест на 2 недели.\n\nЕсли ок — {call} {call_link}. Либо заполните {brief}: {brief_link}', ''),
('s2-think', 2, 30, '[Мы подумаем] Помочь решить', E'Ок. Чтобы было проще принять решение — 3 вопроса и дам 2 варианта: минимальный и усиленный.\n\n{call}: {call_link}', ''),
('s2-time', 2, 40, '[Нет времени] Мы всё берём на себя', E'Понимаю, времени всегда нет. Именно поэтому мы берём всё на себя: съёмка, монтаж, публикация. Вы только говорите «да» и открываете дверь в день съёмки.\n\n{call}: {call_link}', ''),
('s2-tried', 2, 50, '[Уже пробовали] Почему у нас выйдет', E'Понимаю, прошлый опыт мог разочаровать. Мы специализируемся именно на заведениях, знаем специфику (свет, дым, движение) и снимаем с прицелом на алгоритмы VK/IG.\n\nПоказать примеры по вашей нише: {call} {call_link}', ''),
('s2-other', 2, 60, '[Другой подрядчик] Сравнение', E'Хорошо, что уже думаете об этом. Предлагаю просто сравнить: давайте созвонимся на 5 минут — я расскажу, чем отличаемся, и если не зайдёт, ничего не теряете.\n\n{call}: {call_link}', ''),
('s2-close-call', 2, 70, '[Закрытие] Быстрый созвон', 'Чтобы не переписываться — давайте {call}: {call_link}. 5 минут, без обязательств.', ''),
('s2-close-brief', 2, 80, '[Закрытие] Скинуть бриф', E'Чтобы собрать точную смету под {rest}, заполните {brief}: {brief_link}\n\nПосле этого вернусь с конкретным предложением.', '')
on conflict (id) do nothing;
