-- Hub ADERVIS · КП-ссылка: запрос счёта на предоплату
--
-- Клиент выбрал вариант и просит счёт: на кого выставить, ИНН, почта, сумма
-- предоплаты (считает сервер по выбору и проценту из КП). Пишет только функция kp.

alter table public.kp_shares
  add column if not exists invoice    jsonb,
  add column if not exists invoice_at timestamptz;
