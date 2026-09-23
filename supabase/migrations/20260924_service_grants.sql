-- Права служебной роли.
--
-- В проекте выключено автоматическое открытие новых таблиц, поэтому доступ
-- не получила и служебная роль service_role. Из-за этого серверная функция
-- не смогла бы вести учёт обращений к ИИ: ни прочитать дневной счётчик,
-- ни записать новую строку.
--
-- Служебный ключ используется только на сервере и в браузер не попадает.

grant select, insert on public.ai_usage to service_role;

-- Полный доступ к данным нужен для обслуживания: резервные копии,
-- массовый перенос записей, разбор проблем.
grant select, insert, update, delete on
  public.knowledge, public.content, public.tasks, public.metrics, public.members
  to service_role;

grant select on public.activity to service_role;
