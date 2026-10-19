-- ADERVIS Intelligence · контент-план: что, когда и как выходит
--
-- У публикации появляются формат (пост, клип, карусель…), рубрика, время
-- выхода, цель (охват, доверие, заявки), ТЗ на визуал для съёмки или
-- дизайна и призыв к действию. Всё необязательно: старые записи остаются
-- как были.

alter table public.content
  add column if not exists format    text not null default '' check (length(format) <= 40),
  add column if not exists rubric    text not null default '' check (length(rubric) <= 40),
  add column if not exists post_time text not null default '' check (post_time = '' or post_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column if not exists goal      text not null default '' check (length(goal) <= 40),
  add column if not exists visual    text not null default '' check (length(visual) <= 2000),
  add column if not exists cta       text not null default '' check (length(cta) <= 300);
