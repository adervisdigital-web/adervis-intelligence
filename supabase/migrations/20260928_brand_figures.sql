-- Брендбук: чертежи.
--
-- Страницы, которые не пишутся словами: охранное поле, минимальные размеры,
-- неправильное использование знака и сочетания цветов с контрастом.
-- Сам рисунок живёт в коде приложения, в базе — только выбор чертежа.

alter table public.brand drop constraint if exists brand_kind_check;
alter table public.brand add constraint brand_kind_check
  check (kind in ('colors', 'fonts', 'text', 'gallery', 'figure'));

insert into public.brand (id, title, kind, sort, data) values

('clearspace', 'Охранное поле знака', 'figure', 11, jsonb_build_object(
  'figure', 'clearspace',
  'body', E'— Свободное поле вокруг знака не меньше половины его высоты\n— В это поле не заходят ни текст, ни чужие логотипы, ни край макета\n— В плотных макетах лучше уменьшить знак, чем сократить поле')),

('minsize', 'Минимальные размеры', 'figure', 12, jsonb_build_object(
  'figure', 'minsize',
  'body', E'— Горизонтальный логотип — от 120 пикселей или 30 мм\n— Знак — от 24 пикселей или 8 мм\n— Знак в строке текста — от 16 пикселей\n— Меньше не воспроизводим: тонкие линии слипаются')),

('misuse-figure', 'Как нельзя: наглядно', 'figure', 16, jsonb_build_object(
  'figure', 'misuse',
  'body', E'Шесть случаев, которые встречаются чаще всего. Если сомневаетесь — возьмите знак из файла и ничего с ним не делайте.')),

('contrast', 'Сочетания цветов', 'figure', 36, jsonb_build_object(
  'figure', 'contrast',
  'body', E'Контраст посчитан по стандарту доступности. Ниже 4,5:1 сочетание годится только для крупного текста и не годится для основного.'))

on conflict (id) do nothing;
