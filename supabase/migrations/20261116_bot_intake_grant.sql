-- ADERVIS Intelligence · права сервера на копилку служебного бота
--
-- У service_role не было прав на bot_intake_items: пересланные боту
-- сообщения молча не сохранялись, и «Разобрать» / «Ответы к брифу»
-- видели пустую копилку. Доступ по-прежнему только у сервера.

grant select, insert, update, delete on public.bot_intake_items to service_role;
