-- КП-ссылка: клиент выбирает вариант и дополнительные работы прямо на странице.
-- Выбор пишет функция kp (сумму считает сама по снимку, а не по словам браузера).
alter table public.kp_shares add column if not exists choice jsonb;
alter table public.kp_shares add column if not exists chosen_at timestamptz;
