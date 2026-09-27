-- ADERVIS Intelligence · почему теряем
--
-- Отказ без причины ничему не учит. У заявки в «Отказ» / «Пропало» и у
-- компании в «Не интересно» записывается причина — из них складывается
-- картина «почему теряем», и видно, что чинить: цену, скорость ответа
-- или выбор ниши.

alter table public.leads add column if not exists lost_reason text not null default ''
  check (length(lost_reason) <= 60);
alter table public.prospects add column if not exists lost_reason text not null default ''
  check (length(lost_reason) <= 60);
