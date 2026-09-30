-- ADERVIS Intelligence · наборы ключевых фраз для рекламы
--
-- Набор — сегмент аудитории для таргета: фразы и минус-фразы столбиком,
-- ровно в том виде, в каком их вставляют в рекламный кабинет. Кампания
-- ссылается на набор — у набора видны расход и заявки, и понятно, какие
-- фразы приводят людей, а какие только тратят бюджет.

create table if not exists public.keyword_sets (
  id         text primary key default gen_random_uuid()::text,
  name       text not null check (length(name) between 1 and 120),
  direction  text not null default 'Stock' check (direction in ('Студия', 'CRM', 'Stock', 'Медиа')),
  channel    text not null default 'ВКонтакте' check (length(channel) between 1 and 60),
  phrases    text not null default '' check (length(phrases) <= 20000),
  minus      text not null default '' check (length(minus) <= 5000),
  note       text not null default '' check (length(note) <= 2000),
  sort       integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.campaigns add column if not exists keyword_set_id text
  references public.keyword_sets(id) on delete set null;

drop trigger if exists touch_row on public.keyword_sets;
create trigger touch_row before insert or update on public.keyword_sets
  for each row execute function public.touch();
drop trigger if exists log_row on public.keyword_sets;
create trigger log_row after insert or update or delete on public.keyword_sets
  for each row execute function public.log_activity();

alter table public.keyword_sets enable row level security;
drop policy if exists members_all on public.keyword_sets;
create policy members_all on public.keyword_sets for all to authenticated
  using (public.is_member()) with check (public.is_member());
grant select, insert, update, delete on public.keyword_sets to authenticated;
grant select, insert, update, delete on public.keyword_sets to service_role;
revoke all on public.keyword_sets from anon;

-- Стартовые наборы для Adervis Stock во ВКонтакте. Аудитория — монтажёры,
-- моушн-дизайнеры, дизайнеры и SMM, которым нужен файл с Envato Elements
-- без своей подписки. Минус-фразы отсекают тех, кто платить не собирается
-- (ищет бесплатно и взломы), и авторов, которые хотят продавать на Envato.
insert into public.keyword_sets (id, name, direction, channel, sort, phrases, minus, note) values
('ks-stock-envato', 'Envato напрямую — горячие', 'Stock', 'ВКонтакте', 10,
$b$envato elements
envato elements скачать
envato elements подписка
envato elements цена
envato elements в россии
envato elements оплата из россии
как оплатить envato elements
envato elements без подписки
envato elements купить
envato elements аккаунт
envato elements не работает в россии
envato скачать
энвато
энвато элементс
элементс энвато$b$,
$b$бесплатно
торрент
crack
кряк
взлом
nulled
rutracker
автор
продавать
заработок
вакансия
курс$b$,
$b$Самые тёплые: человек знает Envato и ищет, как до него добраться. Ставим первым и сравниваем с остальными по цене заявки. Посадочная — stock.adervis.ru/?plan=trial: сутки за 149 ₽ снимают страх первой покупки. В объявлении не пишем «лицензия», «официальный», «партнёр Envato».$b$),

('ks-stock-motion', 'Шаблоны для монтажа и моушна', 'Stock', 'ВКонтакте', 20,
$b$шаблоны after effects
шаблоны after effects скачать
проекты after effects
шаблоны premiere pro
пресеты premiere pro
переходы для premiere pro
титры after effects
анимация логотипа after effects шаблон
интро шаблон after effects
заставка для видео шаблон
mogrt шаблоны
шаблоны для davinci resolve$b$,
$b$бесплатно
торрент
crack
кряк
взлом
nulled
rutracker
курс
урок
как сделать
вакансия$b$,
$b$Монтажёры и моушн-дизайнеры. Ищут конкретный шаблон — оффер «любой шаблон по ссылке, от 149 ₽ за сутки». «Урок» и «как сделать» в минусе: это учатся, а не покупают.$b$),

('ks-stock-footage', 'Футажи, музыка и звуки', 'Stock', 'ВКонтакте', 30,
$b$футажи для монтажа
стоковые видео
стоковые футажи 4k
музыка для видео без авторских прав
музыка для монтажа
стоковая музыка
звуковые эффекты для видео
sfx для монтажа
звуки для монтажа$b$,
$b$бесплатно
торрент
скачать бесплатно
рингтон
mp3
слушать
вакансия$b$,
$b$Видеографы и SMM. Широкая аудитория — дешевле показ, ниже намерение. Запускать после «Envato напрямую», если он окупается. «Слушать», «mp3», «рингтон» в минусе — это слушатели, а не монтажёры.$b$),

('ks-stock-design', 'Дизайн: мокапы, шрифты, графика', 'Stock', 'ВКонтакте', 40,
$b$мокапы psd
мокапы скачать
шрифты для дизайна
шаблоны презентаций
шаблоны для сторис
экшены photoshop
пресеты lightroom
векторная графика
иконки для дизайна
шаблоны для соцсетей$b$,
$b$бесплатно
торрент
crack
кряк
взлом
nulled
курс
урок
вакансия
работа$b$,
$b$Дизайнеры и SMM. На Envato Elements это есть, но конкуренция за этих людей выше: много бесплатных сайтов. Тестовый набор с малым бюджетом.$b$),

('ks-stock-rivals', 'Соседние стоки — тест', 'Stock', 'ВКонтакте', 50,
$b$videohive
audiojungle
motion array
artlist
shutterstock подписка
freepik premium
стоки для дизайнера
фотосток подписка россия
подписка на стоки$b$,
$b$бесплатно
торрент
crack
кряк
взлом
nulled
автор
продавать
заработок$b$,
$b$Люди, которые платят за стоки или ищут, как платить из России. Внимание: videohive и audiojungle — это Envato Market, а не Elements; похожие файлы на Elements часто есть, но не все. В объявлении чужие бренды не упоминаем — только что умеем мы.$b$)
on conflict (id) do nothing;
