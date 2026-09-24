-- Брендбук: разделы.
--
-- Тридцать тем сплошным списком читать невозможно. Раскладываем по семи
-- разделам — так брендбук листается, а не пролистывается.

alter table public.brand add column if not exists section text not null default 'Прочее';

update public.brand set section = 'Компания'      where id in ('about', 'directions', 'naming');
update public.brand set section = 'Знак'          where id in ('logo', 'clearspace', 'minsize', 'logo-dont', 'misuse-figure');
update public.brand set section = 'Цвет'          where id in ('colors-base', 'colors-brand', 'colors-reference', 'contrast');
update public.brand set section = 'Шрифт и текст' where id in ('fonts', 'type-rules');
update public.brand set section = 'Элементы'      where id in ('layout', 'spacing-scale', 'components', 'icons-set', 'ui-elements', 'icons');
update public.brand set section = 'Правила'       where id in ('voice', 'voice-examples', 'handoff');
update public.brand set section = 'Материалы'     where id in ('patterns', 'patterns-rules', 'social', 'social-gallery', 'merch', 'print', 'photo', 'contacts');
