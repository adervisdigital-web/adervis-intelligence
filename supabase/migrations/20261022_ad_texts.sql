-- ADERVIS Intelligence · тексты объявлений и продажи с рекламы
--
-- 1. У набора фраз — варианты объявлений: заголовок, короткий и длинный
--    текст. Сегменту — свои слова: монтажёру про шаблоны, дизайнеру про
--    мокапы.
-- 2. Продажи в кампании. Stock продаёт на своём сайте, а не заявками:
--    число покупок с рекламы переносится из его админки, и у кампании
--    считается цена продажи.

create table if not exists public.ad_texts (
  id             text primary key default gen_random_uuid()::text,
  keyword_set_id text not null references public.keyword_sets(id) on delete cascade,
  title          text not null check (length(title) between 1 and 100),
  body           text not null default '' check (length(body) <= 500),
  long_text      text not null default '' check (length(long_text) <= 1000),
  status         text not null default 'Черновик' check (status in ('Черновик', 'В работе', 'Выключено')),
  note           text not null default '' check (length(note) <= 500),
  sort           integer not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     text
);
create index if not exists ad_texts_set_idx on public.ad_texts (keyword_set_id, sort);

alter table public.campaigns add column if not exists sales integer not null default 0 check (sales >= 0);

drop trigger if exists touch_row on public.ad_texts;
create trigger touch_row before insert or update on public.ad_texts
  for each row execute function public.touch();
drop trigger if exists log_row on public.ad_texts;
create trigger log_row after insert or update or delete on public.ad_texts
  for each row execute function public.log_activity();

alter table public.ad_texts enable row level security;
drop policy if exists members_all on public.ad_texts;
create policy members_all on public.ad_texts for all to authenticated
  using (public.is_member()) with check (public.is_member());
grant select, insert, update, delete on public.ad_texts to authenticated;
grant select, insert, update, delete on public.ad_texts to service_role;
revoke all on public.ad_texts from anon;

-- Стартовые объявления для наборов Stock. Факты — из документов Stock:
-- тарифы 149 ₽ (10 файлов, сутки) и 449 ₽ (300 файлов, месяц), оригинал
-- без водяных знаков, личный кабинет, оплата картой, доступ сразу.
-- Слов «лицензия», «официальный», «партнёр Envato» нет и быть не должно.
insert into public.ad_texts (id, keyword_set_id, sort, title, body, long_text) values
('at-envato-1', 'ks-stock-envato', 10, 'Envato Elements без подписки',
 'Вставьте ссылку — получите оригинал. 10 файлов за 149 ₽.',
 'Шаблоны, футажи, музыка и графика с Envato Elements без своей подписки. Вставляете ссылку на файл — получаете оригинал без водяных знаков. Сутки — 10 файлов за 149 ₽, месяц — 300 файлов за 449 ₽. Оплата картой, доступ открывается сразу.'),
('at-envato-2', 'ks-stock-envato', 20, 'Файлы с Envato — по ссылке',
 'Оплата картой, доступ сразу. Месяц — 300 файлов за 449 ₽.',
 'Не нужна своя подписка и общий логин: у вас личный кабинет, где видно, сколько файлов и дней осталось. Вставили ссылку с elements.envato.com — забрали оригинал, обычно меньше чем за минуту.'),
('at-motion-1', 'ks-stock-motion', 10, 'Любой шаблон After Effects',
 'По ссылке с Envato Elements. Сутки — 10 файлов за 149 ₽.',
 'Шаблоны After Effects и Premiere Pro, переходы, титры, интро — всё, что есть на Envato Elements. Вставляете ссылку — получаете оригинальный проект без водяных знаков. Под дедлайн — сутки за 149 ₽, для постоянной работы — месяц, 300 файлов за 449 ₽.'),
('at-motion-2', 'ks-stock-motion', 20, 'Шаблон нужен к вечеру?',
 'Ссылка с Envato Elements → оригинал. Обычно меньше минуты.',
 'Мы в Adervis сами каждый день монтируем на шаблонах Envato и сделали сервис, чтобы это было доступно и вам. Без своей подписки: сутки — 10 файлов за 149 ₽.'),
('at-footage-1', 'ks-stock-footage', 10, 'Футажи и музыка для монтажа',
 'Оригиналы с Envato Elements по ссылке. 300 файлов за 449 ₽.',
 'Стоковые видео, музыка и звуковые эффекты с Envato Elements — без своей подписки и без водяных знаков. Вставляете ссылку на файл — забираете оригинал. Месяц — 300 файлов за 449 ₽, это 1,5 ₽ за файл.'),
('at-design-1', 'ks-stock-design', 10, 'Мокапы, шрифты, графика',
 'Всё с Envato Elements по ссылке. 1,5 ₽ за файл за месяц.',
 'Мокапы, шрифты, иконки, пресеты и шаблоны для соцсетей с Envato Elements — оригиналы по вашей ссылке, без своей подписки. Сутки — 10 файлов за 149 ₽, месяц — 300 файлов за 449 ₽.'),
('at-rivals-1', 'ks-stock-rivals', 10, 'Стоки без своей подписки',
 'Envato Elements по ссылке: видео, музыка, шаблоны. От 149 ₽.',
 'Видео, музыка, шаблоны, графика и шрифты с Envato Elements — по вашей ссылке, в оригинале. Своя подписка не нужна: сутки — 10 файлов за 149 ₽, месяц — 300 файлов за 449 ₽. Оплата картой, доступ сразу.')
on conflict (id) do nothing;
