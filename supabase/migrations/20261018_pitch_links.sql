-- ADERVIS Intelligence · первое сообщение от магнита и связи между разделами
--
-- 1. У лид-магнита — текст первого сообщения. Подстановки {компания},
--    {вид бизнеса}, {город} заполняются из карточки компании.
-- 2. Компания помнит, какой магнит ей предложили: у магнита видно, скольким
--    написали и сколько ответили — не только сколько заявок он принёс.
-- 3. Кампания помнит, какую публикацию продвигает: расход и просмотры
--    видны вместе.

alter table public.lead_magnets add column if not exists pitch text not null default ''
  check (length(pitch) <= 2000);

alter table public.prospects add column if not exists magnet_id text
  references public.lead_magnets(id) on delete set null;
create index if not exists prospects_magnet_idx on public.prospects (magnet_id);

alter table public.campaigns add column if not exists content_id text
  references public.content(id) on delete set null;

-- Тексты короткие и личные: одно наблюдение про компанию, одно предложение,
-- никакого прайса. Меняются в карточке магнита.
update public.lead_magnets set pitch = $b$Здравствуйте! Посмотрели {компания} — у вас хорошее место, но в соцсетях это пока не видно: фото и видео не передают атмосферу.

Мы продакшн-студия ADERVIS. Могу бесплатно записать короткий видеоразбор на 15 минут: что в визуале сейчас отталкивает гостей и три правки, которые можно сделать уже на этой неделе своими силами.

Прислать?$b$ where id = 'lm-visual-audit' and pitch = '';

update public.lead_magnets set pitch = $b$Здравствуйте! Если в {компания} думаете о видео, но непонятно, сколько оно стоит, — сделали простой расчёт: пять вопросов, и видно вилку цены с объяснением, из чего она складывается.

Пришлю ссылку?$b$ where id = 'lm-video-price' and pitch = '';

update public.lead_magnets set pitch = $b$Здравствуйте! Посмотрели ваши работы — {компания} явно много снимает для клиентов.

Мы делаем Adervis CRM для студий и фрилансеров: сметы, КП и проекты в одном месте. Предлагаю 20-минутный созвон — заведём ваш прайс и первую смету вместе, вы уйдёте с рабочей системой, а не с пустым экраном. Бесплатно, без обязательств.

Когда удобно?$b$ where id = 'lm-crm-setup' and pitch = '';

update public.lead_magnets set pitch = $b$Здравствуйте! Собрали шаблон сметы для видеопродакшна — со статьями, которые обычно забывают: техника, пост-продакшн, правки, налоги.

Пригодится {компания}? Пришлю бесплатно.$b$ where id = 'lm-estimate-template' and pitch = '';

update public.lead_magnets set pitch = $b$Здравствуйте! Если для проектов {компания} нужны шаблоны, футажи или музыка — напишите задачу, пришлём 10 подходящих ассетов с Envato. Бесплатно, просто подборка ссылок.$b$ where id = 'lm-stock-pick' and pitch = '';
