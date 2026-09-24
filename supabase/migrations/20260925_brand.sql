-- ADERVIS Intelligence · раздел «Брендбук»
--
-- Фирменный стиль в одном месте: палитра, шрифты, логотип и правила.
-- Содержимое живёт в базе и правится прямо в приложении — это не картинка
-- и не PDF, который устаревает в день выпуска.

create table if not exists public.brand (
  id         text primary key,
  title      text not null check (length(title) between 1 and 200),
  kind       text not null check (kind in ('colors', 'fonts', 'text')),
  sort       integer not null default 0,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

drop trigger if exists touch_row on public.brand;
create trigger touch_row before insert or update on public.brand
  for each row execute function public.touch();

drop trigger if exists log_row on public.brand;
create trigger log_row after insert or update or delete on public.brand
  for each row execute function public.log_activity();

alter table public.brand enable row level security;

drop policy if exists members_all on public.brand;
create policy members_all on public.brand for all to authenticated
  using (public.is_member()) with check (public.is_member());

grant select, insert, update, delete on public.brand to authenticated;
grant select, insert, update, delete on public.brand to service_role;
revoke all on public.brand from anon;

-- --------------------------------------------------- содержимое брендбука
-- Перенесено из описания дизайн-системы сайта (Brand 2.0), чтобы у студии
-- и у сайта был один источник правды.

insert into public.brand (id, title, kind, sort, data) values
('logo', 'Логотип', 'text', 10, jsonb_build_object('body',
  E'Золотая «гора»-стрелка — главный знак бренда.\n\n— logo.svg: горизонтальный, иконка и надпись ADERVIS / DIGITAL AGENCY. Для тёмного фона: шапка, футер, тёмные секции.\n— icon.svg: только знак. Фавикон, мобильная навигация, акцент в карточках и декоре.\n— На светлом фоне белая надпись не читается. Пока используем логотип только на тёмном. Нужна светлая версия — потребуется отдельный файл с тёмным текстом.\n— Знак не растягивать, не перекрашивать, не добавлять тени и обводки.')),

('colors-base', 'Базовые цвета', 'colors', 20, jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('name', 'Фон', 'hex', '#141414', 'usage', 'основной фон, совпадает с фоном логотипа'),
  jsonb_build_object('name', 'Поверхность 1', 'hex', '#1b1b1b', 'usage', 'секции поверх фона'),
  jsonb_build_object('name', 'Поверхность 2', 'hex', '#212121', 'usage', 'карточки и панели'),
  jsonb_build_object('name', 'Поверхность выше', 'hex', '#272727', 'usage', 'наведение и активное состояние'),
  jsonb_build_object('name', 'Текст', 'hex', '#fdfdfd', 'usage', 'основной текст на тёмном'),
  jsonb_build_object('name', 'Текст вторичный', 'hex', '#9a9a9a', 'usage', 'подписи и пояснения'),
  jsonb_build_object('name', 'Текст тонкий', 'hex', '#5c5c5c', 'usage', 'подсказки в полях, недоступное')))),

('colors-brand', 'Акцент и направления', 'colors', 30, jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('name', 'Золото', 'hex', '#f6bd3a', 'usage', 'главный акцент: одна кнопка на экране, знак, ключевые цифры'),
  jsonb_build_object('name', 'Золото светлое', 'hex', '#ffd673', 'usage', 'наведение, свечение, градиенты'),
  jsonb_build_object('name', 'Видео', 'hex', '#ef4444', 'usage', 'цвет направления «Видео»'),
  jsonb_build_object('name', 'Дизайн', 'hex', '#8b5cf6', 'usage', 'цвет направления «Дизайн»'),
  jsonb_build_object('name', 'Фото', 'hex', '#f6bd3a', 'usage', 'цвет направления «Фото» — совпадает с золотом'),
  jsonb_build_object('name', 'ИИ-контент', 'hex', '#22c55e', 'usage', 'цвет направления «ИИ»'),
  jsonb_build_object('name', 'CRM: начало', 'hex', '#6c00ff', 'usage', 'градиент продукта Adervis CRM'),
  jsonb_build_object('name', 'CRM: конец', 'hex', '#9b4dff', 'usage', 'градиент продукта Adervis CRM')))),

('fonts', 'Шрифты', 'fonts', 40, jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('family', 'Unbounded', 'role', 'Заголовки и логотип-надпись', 'weights', '500, 700', 'sample', 'ADERVIS — визуал для бизнеса'),
  jsonb_build_object('family', 'Golos Text', 'role', 'Текст, кнопки, навигация, формы', 'weights', '400, 500, 600', 'sample', 'Видео, дизайн, фото и ИИ под один договор')))),

('type-rules', 'Правила набора', 'text', 50, jsonb_build_object('body',
  E'Размеры: 12 — подписи и бейджи, 14 — текст и кнопки, 16 — крупный текст, 20 — подзаголовок, 28 — заголовок секции, 36–56 — заголовок экрана.\n\n— Unbounded уже широкий: дополнительно разрядку не добавлять.\n— Моноширинный шрифт из системы убран. Его роль — заголовки в верхнем регистре с разрядкой на Golos Text.\n— Контраст текста к фону не ниже 7:1.')),

('layout', 'Отступы и скругления', 'text', 60, jsonb_build_object('body',
  E'Отступы кратны 4: 4, 8, 12, 16, 24, 32, 48, 64.\n\nСкругления:\n— 4 — бейдж, тег, чип\n— 8 — поле ввода, кнопка\n— 12 — второстепенная карточка\n— 16 — основная карточка и баннер\n— 24 — крупные секции и модальные окна')),

('components', 'Кнопки и карточки', 'text', 70, jsonb_build_object('body',
  E'Главная кнопка: золотой фон, тёмный текст #141414, жирность 600, отступы 12/24, скругление 8, при наведении — свечение и подъём на 2 пикселя.\nВторостепенная: прозрачный фон, тонкая рамка, при наведении рамка золотится.\n\n— Минимальная ширина кнопки 120, высота 44.\n— Карточка: поверхность #212121, тонкая рамка, скругление 16, отступ 24.\n— Палец на телефоне — не меньше 44×44.')),

('icons', 'Иконки и знаки', 'text', 80, jsonb_build_object('body',
  E'— Только SVG внутри страницы, без эмодзи.\n— Размеры: 16 в строке текста, 20–24 в карточках и навигации, 32 в крупных блоках.\n— Цвет наследуется от текста, акцентные — золото или цвет направления.\n— Золотой знак используется как декоративный акцент в больших блоках.')),

('voice', 'Как мы говорим', 'text', 90, jsonb_build_object('body',
  E'Аудитория: бизнес-заказчики студии и digital-аудитория CRM. Россия.\n\n— Пишем живо и просто, разными словами, без канцелярита.\n— Не выдумываем опыт, клиентов, результаты и статистику.\n— Спорим с идеей, а не с человеком: конфликт вокруг подхода, а не унижение клиента.\n— Цифры публикуем только те, что подтверждены.'))
on conflict (id) do nothing;
