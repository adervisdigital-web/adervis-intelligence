-- ADERVIS Intelligence · лид-магниты
--
-- Лид-магнит — то, что человек получает бесплатно в обмен на контакт:
-- разбор, калькулятор, шаблон. Заявка привязывается к магниту, который её
-- принёс, и видно, какой из них приводит к сделкам, а какой только собирает
-- почты.

create table if not exists public.lead_magnets (
  id         text primary key default gen_random_uuid()::text,
  name       text not null check (length(name) between 1 and 120),
  direction  text not null default 'Студия' check (direction in ('Студия', 'CRM', 'Stock', 'Медиа')),
  format     text not null default 'Разбор' check (length(format) between 1 and 40),
  status     text not null default 'Идея' check (status in ('Идея', 'Готовим', 'Работает', 'Выключен')),
  audience   text not null default '' check (length(audience) <= 300),
  promise    text not null default '' check (length(promise) <= 500),
  exchange   text not null default '' check (length(exchange) <= 200),
  next_step  text not null default '' check (length(next_step) <= 300),
  channels   text not null default '' check (length(channels) <= 300),
  note       text not null default '' check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.leads add column if not exists magnet_id text
  references public.lead_magnets(id) on delete set null;
create index if not exists leads_magnet_idx on public.leads (magnet_id);

drop trigger if exists touch_row on public.lead_magnets;
create trigger touch_row before insert or update on public.lead_magnets
  for each row execute function public.touch();
drop trigger if exists log_row on public.lead_magnets;
create trigger log_row after insert or update or delete on public.lead_magnets
  for each row execute function public.log_activity();

alter table public.lead_magnets enable row level security;
drop policy if exists members_all on public.lead_magnets;
create policy members_all on public.lead_magnets for all to authenticated
  using (public.is_member()) with check (public.is_member());
grant select, insert, update, delete on public.lead_magnets to authenticated;
grant select, insert, update, delete on public.lead_magnets to service_role;
revoke all on public.lead_magnets from anon;

-- Стартовые идеи. Каждая отвечает на вопрос «почему это ведёт к продаже»:
-- следующий шаг после магнита — всегда платная услуга того же направления.
insert into public.lead_magnets (id, name, direction, format, status, audience, promise, exchange, next_step, channels, note) values
('lm-visual-audit', 'Разбор визуала за 15 минут', 'Студия', 'Видеоразбор', 'Идея',
 'Владельцы кафе, салонов, магазинов, у которых есть соцсети или карточки на картах',
 'Запишем короткое видео: что в вашем визуале отталкивает клиента и три правки, которые можно сделать уже на этой неделе',
 'Ссылка на соцсеть или сайт и контакт для ответа',
 'Предложить съёмку или фирменный стиль под найденные проблемы',
 'Поиск клиентов (первое сообщение), сайт, ВКонтакте',
 $b$Самый сильный кандидат для холодного поиска: вместо «мы студия, вот прайс» — готовая польза в первом же сообщении. Делается за 15 минут на разбор, окупается одной сделкой.$b$),
('lm-video-price', 'Калькулятор стоимости ролика', 'Студия', 'Калькулятор', 'Идея',
 'Компании, которые впервые заказывают видео и не понимают порядок цен',
 'Пять вопросов — и вилка цены с объяснением, из чего она складывается',
 'Телефон или Telegram, чтобы прислать расчёт',
 'Созвон на 15 минут и точная смета из Adervis CRM',
 'Сайт, Яндекс Директ',
 $b$Закрывает главный страх заказчика — «сколько это стоит». Смету после созвона делаем в своей CRM: заодно показываем её в деле.$b$),
('lm-crm-setup', 'Настроим CRM за вас за 20 минут', 'CRM', 'Созвон', 'Идея',
 'Студии и фрилансеры в видео, фото и дизайне',
 'Созвон, на котором мы заводим ваш прайс и первую смету — вы уходите с рабочей CRM, а не с пустым экраном',
 'Почта для регистрации и время созвона',
 'Платный тариф после пробного периода',
 'Telegram, сообщества фрилансеров, амбассадоры',
 $b$Прямо бьёт в главную потерю воронки CRM: 10 из 13 пробных не вернулись после первого дня, 6 не сделали ни одной сметы. Оба живых пользователя — те, кому продукт показали руками.$b$),
('lm-estimate-template', 'Шаблон сметы видеопродакшна', 'CRM', 'Шаблон', 'Идея',
 'Операторы, монтажёры и небольшие студии, которые считают в таблицах',
 'Таблица сметы со всеми статьями, которые обычно забывают: техника, пост-продакшн, правки, налоги',
 'Почта',
 'Письмо через три дня: «эту же смету в CRM можно собрать за 5 минут и отправить клиенту ссылкой»',
 'Telegram, ВКонтакте, Дзен',
 $b$Магнит, который сам подводит к продукту: человек видит, как много ручной работы, и CRM становится очевидным следующим шагом.$b$),
('lm-stock-pick', 'Подборка ассетов под задачу', 'Stock', 'Подборка', 'Идея',
 'Монтажёры и дизайнеры, которые ищут шаблоны и футажи',
 'Пришлите задачу — пришлём 10 подходящих ассетов с Envato ссылками',
 'Telegram для ответа',
 'Покупка доступа к ассетам через Adervis Stock',
 'Telegram, ВКонтакте',
 $b$Раздаём именно подборку ссылок, а не сами файлы: лицензия Envato не разрешает передавать ассеты дальше.$b$)
on conflict (id) do nothing;
