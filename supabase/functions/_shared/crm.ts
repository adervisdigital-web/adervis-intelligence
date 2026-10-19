// Связь с ADERVIS CRM: брифы, которые клиенты заполняют по ссылке CRM,
// становятся заявкой и брифом в Intelligence; свои шаблоны брифов студии
// уходят в CRM. Без сети и базы — проверяется тестами.
//
// CRM читаем входом самой студии (логин и пароль владельца CRM, хранятся на
// сервере Intelligence): политика доступа CRM отдаёт ровно данные этой студии.

// Публичные адрес и ключ CRM — те же, что видит любой посетитель app.adervis.ru.
export const CRM_URL = 'https://qzeylogyledmhjpzvgkk.supabase.co';
export const CRM_KEY = 'sb_publishable_E9JgbQiA7namAFiZAAbZEQ_aBn11VgJ';
export const CRM_APP = 'https://app.adervis.ru/';

export const CRM_TYPES = [
  { id: 'video', label: 'Видео' }, { id: 'photo', label: 'Фото' }, { id: 'design', label: 'Дизайн' },
  { id: 'ai', label: 'ИИ' }, { id: 'general', label: 'Общий' }
];
export const briefLink = (agency: string, type = '') => `${CRM_APP}?brief=${encodeURIComponent(agency)}${type ? '&type=' + encodeURIComponent(type) : ''}`;

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

// ---------------------------------------------------------------- шаблоны
// Поля в формате редактора брифов CRM: section|text|tel|email|textarea|date|select,
// system — контакт, из которого CRM заводит карточку клиента; primary — главное описание.
const f = (o: Row) => ({ type: 'text', required: false, half: false, enabled: true, options: [], placeholder: '', ...o });
const contacts = () => [
  f({ id: 'sec_contacts', type: 'section', label: 'Контактные данные' }),
  f({ id: 'name', label: 'Ваше имя', placeholder: 'Иван Иванов', required: true, half: true, system: 'name' }),
  f({ id: 'phone', label: 'Телефон', type: 'tel', placeholder: '+7 900 000-00-00', half: true, system: 'phone' }),
  f({ id: 'email', label: 'Email', type: 'email', placeholder: 'your@email.com', required: true, half: true, system: 'email' }),
  f({ id: 'company', label: 'Компания', placeholder: 'ООО «Название»', half: true })
];
const BUDGETS = ['Обсудим', 'До 30 000 ₽', '30 000 – 80 000 ₽', '80 000 – 200 000 ₽', '200 000 – 500 000 ₽', '500 000 ₽+'];
const SOURCES = ['Рекомендация', 'ВКонтакте', 'Telegram', 'Google / Яндекс', 'Сайт adervis.ru', 'Другое'];
const tail = () => [
  f({ id: 'sec_budget', type: 'section', label: 'Бюджет и сроки' }),
  f({ id: 'budget', label: 'Бюджет', type: 'select', options: BUDGETS, half: true }),
  f({ id: 'deadline', label: 'Когда нужен результат', type: 'date', half: true }),
  f({ id: 'source', label: 'Откуда узнали о нас?', type: 'select', options: SOURCES, half: true }),
  f({ id: 'references', label: 'Что нравится — ссылки на примеры', type: 'textarea', placeholder: 'Ролики, сайты, аккаунты конкурентов…' })
];

export const ADERVIS_TEMPLATES = [
  { id: 'own_adv_motion', label: 'Моушн и графика', title: 'Бриф на моушн-дизайн и графику',
    sub: 'Анимация, пакет графики для видео и новостей, инфографика, 3D. Ответьте на главное — пришлём расчёт и план за один рабочий день.',
    fields: [...contacts(),
      f({ id: 'sec_task', type: 'section', label: 'Задача' }),
      f({ id: 'motionType', label: 'Что нужно', type: 'select', half: true, options: ['Пакет графики для видео / новостей', 'Анимация логотипа', 'Объясняющий ролик', 'Инфографика', 'Заставка и титры', '3D-визуализация', 'Другое'] }),
      f({ id: 'where', label: 'Где будет показываться', type: 'select', half: true, options: ['YouTube / корпоративное ТВ', 'Соцсети', 'Экран на выставке / мероприятии', 'Сайт', 'Презентация', 'Несколько площадок'] }),
      f({ id: 'aspect', label: 'Формат кадра', type: 'select', half: true, options: ['Горизонтальный 16:9', 'Вертикальный 9:16', 'Оба', 'Пока не знаю'] }),
      f({ id: 'brandbook', label: 'Фирменный стиль', type: 'select', half: true, options: ['Есть брендбук', 'Есть логотип и цвета', 'Нет — нужно придумать'] }),
      f({ id: 'desc', label: 'Опишите задачу', type: 'textarea', primary: true, required: true, placeholder: 'Что показываем, для кого, сколько элементов (заставка, отбивки, плашки…), кто потом будет собирать видео.' }),
      f({ id: 'volume', label: 'Объём: сколько роликов или элементов', placeholder: 'Например: заставка, 20 отбивок, 3 вида плашек' }),
      ...tail()] },
  { id: 'own_adv_site', label: 'Сайт', title: 'Бриф на сайт',
    sub: 'Лендинг, сайт компании или каталог. Чем точнее ответы — тем точнее срок и цена.',
    fields: [...contacts(),
      f({ id: 'sec_task', type: 'section', label: 'Сайт' }),
      f({ id: 'siteType', label: 'Какой сайт нужен', type: 'select', half: true, options: ['Лендинг — одна страница', 'Сайт компании', 'Каталог / магазин', 'Редизайн существующего', 'Пока не знаю'] }),
      f({ id: 'content', label: 'Тексты и фото', type: 'select', half: true, options: ['Всё есть', 'Есть частично', 'Нужно сделать с нуля'] }),
      f({ id: 'domain', label: 'Домен и хостинг', type: 'select', half: true, options: ['Есть', 'Нет — поможете', 'Не знаю'] }),
      f({ id: 'integrations', label: 'Что подключить', placeholder: 'Формы заявок, CRM, оплата, Яндекс.Метрика…', half: true }),
      f({ id: 'desc', label: 'Расскажите о бизнесе и задаче сайта', type: 'textarea', primary: true, required: true, placeholder: 'Чем занимаетесь, кто клиенты, что сайт должен делать: собирать заявки, продавать, показывать работы.' }),
      f({ id: 'pages', label: 'Разделы и страницы', type: 'textarea', placeholder: 'Главная, услуги, кейсы, контакты…' }),
      ...tail()] },
  { id: 'own_adv_content', label: 'Контент на месяц', title: 'Бриф на контент на месяц',
    sub: 'Съёмка раз в месяц — короткие ролики и фото для соцсетей на весь месяц.',
    fields: [...contacts(),
      f({ id: 'sec_task', type: 'section', label: 'Контент' }),
      f({ id: 'networks', label: 'Где публикуете', placeholder: 'ВКонтакте, Telegram, Instagram, YouTube…', half: true }),
      f({ id: 'perMonth', label: 'Сколько роликов в месяц', type: 'select', half: true, options: ['4', '8', '12', '16+', 'Посоветуйте'] }),
      f({ id: 'photos', label: 'Фото', type: 'select', half: true, options: ['Не нужно', 'До 20 в месяц', '20–50 в месяц', 'Больше 50'] }),
      f({ id: 'publish', label: 'Кто публикует', type: 'select', half: true, options: ['Мы сами', 'Вы — с текстами', 'Обсудим'] }),
      f({ id: 'desc', label: 'Чем занимаетесь и что хотите от соцсетей', type: 'textarea', primary: true, required: true, placeholder: 'Продукт, аудитория, что уже ведёте, чего не хватает: охватов, заявок, узнаваемости.' }),
      ...tail()] },
  { id: 'own_adv_event', label: 'Мероприятие', title: 'Бриф на съёмку мероприятия',
    sub: 'Фото, видео, ролик в тот же день, трансляция. Расскажите о событии — подберём команду.',
    fields: [...contacts(),
      f({ id: 'sec_task', type: 'section', label: 'Мероприятие' }),
      f({ id: 'eventType', label: 'Что за событие', type: 'select', half: true, options: ['Конференция / форум', 'Корпоратив', 'Выставка', 'Спорт / турнир', 'Презентация продукта', 'Другое'] }),
      f({ id: 'eventDate', label: 'Дата', type: 'date', half: true }),
      f({ id: 'place', label: 'Город и площадка', half: true }),
      f({ id: 'hours', label: 'Сколько длится', type: 'select', half: true, options: ['До 3 часов', '3–6 часов', 'Полный день', 'Несколько дней'] }),
      f({ id: 'need', label: 'Что нужно', type: 'select', half: true, options: ['Фото', 'Видео', 'Фото и видео', 'Ролик в тот же день', 'Трансляция'] }),
      f({ id: 'desc', label: 'Опишите событие и что нужно получить', type: 'textarea', primary: true, required: true, placeholder: 'Сколько гостей, программа, для чего материалы, к какому сроку.' }),
      ...tail()] }
];

// Добавить шаблоны ADERVIS к состоянию CRM, не трогая остальное.
export function withTemplates(state: Row): Row {
  const s = { ...(state || {}) };
  const own = Array.isArray(s.customBriefTypes) ? s.customBriefTypes.filter((t: Row) => !String(t.id).startsWith('own_adv_')) : [];
  const room = Math.max(0, 8 - own.length);
  const ours = ADERVIS_TEMPLATES.slice(0, room);
  s.customBriefTypes = [...own, ...ours.map(t => ({ id: t.id, label: t.label, icon: 'doc' }))];
  s.briefTemplates = { ...(s.briefTemplates || {}) };
  for (const t of ours) s.briefTemplates[t.id] = { title: t.title, sub: t.sub, fields: t.fields };
  return s;
}

// ----------------------------------------------------- бриф CRM → заявка и бриф
const permDate = (iso: string) => new Date(Date.parse(iso || new Date().toISOString()) + 5 * 36e5).toISOString().slice(0, 10);
const lineOf = (desc: string, label: string) => (String(desc || '').split('\n').find(l => l.startsWith(label + ':')) || '').slice(label.length + 1).trim();

export function fromSubmission(sub: Row, today: string) {
  const name = String(sub.client_name || 'Клиент из брифа').trim().slice(0, 120);
  const company = lineOf(sub.description, 'Компания') || lineOf(sub.description, 'Компания / Организация');
  const type = String(sub.project_type || 'Бриф').trim();
  const client = (company || name).slice(0, 200);
  const first = String(sub.description || '').split('\n').find(Boolean) || '';
  const contactsLine = [sub.client_phone, sub.client_email].filter(Boolean).join(', ');
  const text = [
    `Бриф из ADERVIS CRM · ${type} · ${permDate(sub.submitted_at)}`,
    `Клиент: ${name}${company ? ` (${company})` : ''}${contactsLine ? ` · ${contactsLine}` : ''}`,
    sub.budget ? `Бюджет: ${sub.budget}` : '', sub.deadline ? `Срок: ${sub.deadline}` : '',
    '', String(sub.description || '')
  ].filter((x, i) => x !== '' || i === 4).join('\n').trim();
  const leadId = 'crm-lead-' + sub.id;
  return {
    lead: {
      id: leadId, came_on: permDate(sub.submitted_at), name: (company ? `${company} — ${name}` : name).slice(0, 200), source: 'Бриф CRM',
      direction: 'Студия', request: `${type}: ${first}`.slice(0, 1000), amount: 0, status: 'Новое',
      note: `Из брифа ADERVIS CRM. ${contactsLine}`.trim().slice(0, 1000), reached: 0,
      next_step: 'Разобрать бриф и ответить клиенту', next_on: today, lost_reason: ''
    },
    brief: {
      id: 'crm-' + sub.id, crm_id: String(sub.id), lead_id: leadId, title: `${type.replace(/-бриф$/i, '')}: ${client}`.slice(0, 200), client,
      stage: 'Разбор', source_text: text.slice(0, 60000), next_step: 'Разобрать бриф и задать вопросы', next_on: today
    }
  };
}

export const maskEmail = (e: string) => String(e || '').replace(/^(.{2}).*(@.*)$/, '$1***$2');
