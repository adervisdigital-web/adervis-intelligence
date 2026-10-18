-- ADERVIS Intelligence · служебные отметки переписки — не правка карточки
--
-- Каждое сообщение обновляет у компании «последнее сообщение» и счётчик
-- непрочитанных. Раньше это меняло и время правки карточки: открытая в
-- приложении карточка при сохранении получала ложный конфликт «запись
-- изменил второй руководитель», а журнал — строку на каждое сообщение.
-- Теперь время правки и журнал двигают только поля, которые правят люди
-- (или бот, когда записывает бриф).

drop trigger if exists touch_row on public.prospects;
drop trigger if exists touch_row_upd on public.prospects;
create trigger touch_row before insert on public.prospects
  for each row execute function public.touch();
create trigger touch_row_upd before update on public.prospects
  for each row when (
    (to_jsonb(new) - array['last_message_at', 'last_text', 'last_direction', 'unread', 'bot_state', 'bot_mode',
                           'attempt_count', 'reminded_at', 'ab_variant', 'updated_at', 'updated_by'])
    is distinct from
    (to_jsonb(old) - array['last_message_at', 'last_text', 'last_direction', 'unread', 'bot_state', 'bot_mode',
                           'attempt_count', 'reminded_at', 'ab_variant', 'updated_at', 'updated_by']))
  execute function public.touch();

drop trigger if exists log_row on public.prospects;
drop trigger if exists log_row_upd on public.prospects;
create trigger log_row after insert or delete on public.prospects
  for each row execute function public.log_activity();
create trigger log_row_upd after update on public.prospects
  for each row when (
    (to_jsonb(new) - array['last_message_at', 'last_text', 'last_direction', 'unread', 'bot_state', 'bot_mode',
                           'attempt_count', 'reminded_at', 'ab_variant', 'updated_at', 'updated_by'])
    is distinct from
    (to_jsonb(old) - array['last_message_at', 'last_text', 'last_direction', 'unread', 'bot_state', 'bot_mode',
                           'attempt_count', 'reminded_at', 'ab_variant', 'updated_at', 'updated_by']))
  execute function public.log_activity();

-- правки скриптов и текстов бота людьми — в журнал (бот пишет без входа и туда не попадает)
do $$
declare t text;
begin
  foreach t in array array['sales_scripts', 'outreach_settings'] loop
    execute format('drop trigger if exists log_row on public.%I', t);
    execute format('create trigger log_row after insert or update or delete on public.%I for each row execute function public.log_activity()', t);
  end loop;
end $$;
