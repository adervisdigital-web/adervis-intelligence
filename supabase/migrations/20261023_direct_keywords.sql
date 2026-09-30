-- ADERVIS Intelligence · ключевые фразы: соцсети и Яндекс Директ отдельно
--
-- В соцсетях фраза описывает интересы аудитории, в Директе — поисковый
-- запрос человека, который уже ищет решение. Наборы делятся по площадке
-- (поле channel уже есть), у объявления Директа — второй заголовок.

alter table public.ad_texts add column if not exists title2 text not null default ''
  check (length(title2) <= 100);

-- Наборы Директа для Adervis Stock. Фразы — покупательские запросы, не
-- длиннее семи слов. Минус-слова отсекают ищущих бесплатно и авторов.
insert into public.keyword_sets (id, name, direction, channel, sort, phrases, minus, note) values
('ks-direct-envato', 'Envato — горячие запросы', 'Stock', 'Яндекс Директ', 110,
$b$envato elements
envato elements скачать
envato elements подписка
envato elements купить
envato elements оплатить
envato elements оплата из россии
envato elements россия
envato elements без подписки
envato elements цена подписки
скачать с envato elements
как скачать с envato
энвато элементс
envato скачать шаблон$b$,
$b$бесплатно
торрент
crack
кряк
взлом
nulled
rutracker
автор
продать
заработать
вакансия
курсы$b$,
$b$Человек ищет, как добраться до Envato Elements, — самый короткий путь к покупке. Ведём на stock.adervis.ru/?plan=trial: сутки за 149 ₽ — лёгкая первая покупка. Ставки — выше, чем у тематических запросов.$b$),

('ks-direct-assets', 'Шаблоны, футажи, музыка — запросы', 'Stock', 'Яндекс Директ', 120,
$b$шаблоны after effects скачать
шаблон after effects купить
проекты after effects скачать
шаблоны premiere pro скачать
переходы premiere pro скачать
футажи для монтажа скачать
стоковые видео купить
стоковая музыка для видео
звуковые эффекты скачать
мокапы psd скачать$b$,
$b$бесплатно
торрент
crack
кряк
взлом
nulled
урок
как сделать
онлайн
вакансия$b$,
$b$Ищут конкретный файл, а не сервис: в объявлении — «любой файл с Envato Elements по ссылке». Запускать после горячих запросов, если те окупаются. «Онлайн» в минусе — это ищут онлайн-редакторы.$b$)
on conflict (id) do nothing;

-- Объявления Директа: Заголовок 1 до 56 знаков, Заголовок 2 до 30,
-- текст до 81 — все укладываются.
insert into public.ad_texts (id, keyword_set_id, sort, title, title2, body) values
('at-direct-envato-1', 'ks-direct-envato', 10, 'Envato Elements без подписки — от 149 ₽', 'Оригиналы по вашей ссылке',
 'Вставьте ссылку на файл — получите оригинал без водяных знаков. Оплата картой.'),
('at-direct-envato-2', 'ks-direct-envato', 20, 'Файлы с Envato Elements по вашей ссылке', '300 файлов за 449 ₽',
 'Шаблоны, футажи, музыка, графика. Личный кабинет, доступ сразу после оплаты.'),
('at-direct-assets-1', 'ks-direct-assets', 10, 'Шаблоны After Effects и Premiere по ссылке', 'Сутки — 10 файлов за 149 ₽',
 'Любой файл с Envato Elements в оригинале, без своей подписки. Обычно за минуту.'),
('at-direct-assets-2', 'ks-direct-assets', 20, 'Футажи и музыка с Envato Elements', 'Без своей подписки',
 'Вставьте ссылку — заберите оригинал. Месяц — 300 файлов за 449 ₽, 1,5 ₽ за файл.')
on conflict (id) do nothing;
