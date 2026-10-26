-- ADERVIS Intelligence · срок действия КП и закрытие ссылки
--
-- closed_at: руководитель закрыл ссылку (тендер проигран, ушли к другим) —
-- страница показывает только «предложение закрыто» и контакты, без цен.
-- renew_at: клиент открыл просроченное КП и попросил обновить предложение.

alter table public.kp_shares add column if not exists closed_at timestamptz;
alter table public.kp_shares add column if not exists renew_at timestamptz;
