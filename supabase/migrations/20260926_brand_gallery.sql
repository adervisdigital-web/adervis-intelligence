-- Брендбук: блоки-галереи.
--
-- Паттерны, мерч и оформление соцсетей показываются картинками, а не описанием.
-- Сами изображения лежат в закрытом хранилище, в блоке — только пути и подписи.

alter table public.brand drop constraint if exists brand_kind_check;
alter table public.brand add constraint brand_kind_check
  check (kind in ('colors', 'fonts', 'text', 'gallery'));

insert into public.brand (id, title, kind, sort, data) values
('patterns', 'Паттерны и текстуры', 'gallery', 85, jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('file', 'brand/gallery/pattern-1.jpg', 'caption', 'Паттерн 1'),
  jsonb_build_object('file', 'brand/gallery/pattern-2.jpg', 'caption', 'Паттерн 2'),
  jsonb_build_object('file', 'brand/gallery/pattern-3.jpg', 'caption', 'Паттерн 3'),
  jsonb_build_object('file', 'brand/gallery/pattern-4.jpg', 'caption', 'Паттерн 4'),
  jsonb_build_object('file', 'brand/gallery/pattern-5.jpg', 'caption', 'Паттерн 5'),
  jsonb_build_object('file', 'brand/gallery/pattern-6.jpg', 'caption', 'Паттерн 6'),
  jsonb_build_object('file', 'brand/gallery/pattern-7.jpg', 'caption', 'Паттерн 7')))),

('patterns-rules', 'Паттерны: как применять', 'text', 86, jsonb_build_object('body',
  E'Пока не заполнено — допишем, когда договоримся о правилах.\n\n— Паттерн — фон, а не главный герой: поверх него должен читаться текст\n— Не смешивать два паттерна в одном макете\n— Зернистая текстура film grain — поверх фото и видео, слабым слоем')),

('social-gallery', 'Соцсети: как это выглядит', 'gallery', 101, jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('file', 'brand/gallery/social-avatar.jpg', 'caption', 'Аватар'),
  jsonb_build_object('file', 'brand/gallery/social-youtube-cover.jpg', 'caption', 'Шапка YouTube'),
  jsonb_build_object('file', 'brand/gallery/social-post-1.jpg', 'caption', 'Пост: ролик'),
  jsonb_build_object('file', 'brand/gallery/social-post-2.jpg', 'caption', 'Пост: логотип'),
  jsonb_build_object('file', 'brand/gallery/social-post-3.jpg', 'caption', 'Пост: фирменный стиль'),
  jsonb_build_object('file', 'brand/gallery/social-post-4.jpg', 'caption', 'Пост: бренд'),
  jsonb_build_object('file', 'brand/gallery/social-post-5.jpg', 'caption', 'Пост: моушен'),
  jsonb_build_object('file', 'brand/gallery/social-post-6.jpg', 'caption', 'Пост: соцсети'),
  jsonb_build_object('file', 'brand/gallery/social-vk-menu-1.jpg', 'caption', 'Меню ВК: видео'),
  jsonb_build_object('file', 'brand/gallery/social-vk-menu-2.jpg', 'caption', 'Меню ВК: портфолио')))),

('merch', 'Мерч', 'gallery', 105, jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('file', 'brand/gallery/merch-overview.jpg', 'caption', 'Линейка мерча'),
  jsonb_build_object('file', 'brand/gallery/merch-tshirt-black.jpg', 'caption', 'Футболка тёмная'),
  jsonb_build_object('file', 'brand/gallery/merch-tshirt-white.jpg', 'caption', 'Футболка светлая')))),

('colors-reference', 'Палитра: как выглядит вместе', 'gallery', 35, jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('file', 'brand/gallery/colors-reference.jpg', 'caption', 'Раскладка цветов из исходников'))))
on conflict (id) do nothing;

-- Тексты тем, для которых появились материалы.
update public.brand set data = jsonb_build_object('body',
  E'Оформление собрано: аватар, шапка YouTube, шаблоны постов, меню сообщества ВК. Исходники — в папке бренда, здесь показаны уменьшенные версии.\n\n— Аватар: квадрат, знак по центру, тёмный фон\n— Обложка YouTube: 1600×900, важное держим в центральной трети — по краям обрежет\n— Посты: один смысл на макет, заголовок Eurostile Extd, подпись TT Fors\n— Меню ВК: одинаковая сетка для всех пунктов')
  where id = 'social';

update public.brand set data = jsonb_build_object('body',
  E'Визитки свёрстаны в трёх вариантах: общая, Артёма и Александра, отдельно в CMYK для типографии. Файлы лежат в папке бренда в PDF и исходниках.\n\n— Для печати нужен CMYK и знак в кривых\n— Коммерческие предложения собраны отдельно: КП общее и КП видео\n— Превью визиток в брендбук не поставил: есть только PDF по 25 МБ, нужен экспорт в JPG')
  where id = 'print';
