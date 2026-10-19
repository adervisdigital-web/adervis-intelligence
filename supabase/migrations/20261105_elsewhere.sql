-- ADERVIS Intelligence · клиент ушёл в личную переписку
--
-- Если разговор продолжился в личных сообщениях (личная страница ВК,
-- Telegram, WhatsApp, телефон), диалог в сообществе больше не «ждёт
-- ответа» и не становится «просроченным». Где теперь идёт разговор —
-- elsewhere. Новое сообщение клиента в канале снимает отметку: значит,
-- разговор вернулся сюда.

alter table public.prospects
  add column if not exists elsewhere text not null default '' check (length(elsewhere) <= 60);

create or replace function public.message_touch_prospect() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.prospects
     set last_message_at = new.created_at,
         last_text = left(new.text, 160),
         last_direction = new.direction,
         unread = case when new.direction = 'in' then unread + 1 else unread end,
         elsewhere = case when new.direction = 'in' then '' else elsewhere end
   where id = new.prospect_id;
  return null;
end $$;

-- отметка — служебная: не правка карточки и не строка журнала
drop trigger if exists touch_row_upd on public.prospects;
create trigger touch_row_upd before update on public.prospects
  for each row when (
    (to_jsonb(new) - array['last_message_at', 'last_text', 'last_direction', 'unread', 'bot_state', 'bot_mode', 'elsewhere',
                           'attempt_count', 'reminded_at', 'ab_variant', 'updated_at', 'updated_by'])
    is distinct from
    (to_jsonb(old) - array['last_message_at', 'last_text', 'last_direction', 'unread', 'bot_state', 'bot_mode', 'elsewhere',
                           'attempt_count', 'reminded_at', 'ab_variant', 'updated_at', 'updated_by']))
  execute function public.touch();

drop trigger if exists log_row_upd on public.prospects;
create trigger log_row_upd after update on public.prospects
  for each row when (
    (to_jsonb(new) - array['last_message_at', 'last_text', 'last_direction', 'unread', 'bot_state', 'bot_mode', 'elsewhere',
                           'attempt_count', 'reminded_at', 'ab_variant', 'updated_at', 'updated_by'])
    is distinct from
    (to_jsonb(old) - array['last_message_at', 'last_text', 'last_direction', 'unread', 'bot_state', 'bot_mode', 'elsewhere',
                           'attempt_count', 'reminded_at', 'ab_variant', 'updated_at', 'updated_by']))
  execute function public.log_activity();
