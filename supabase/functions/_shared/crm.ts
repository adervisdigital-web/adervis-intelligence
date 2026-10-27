// Связь с ADERVIS CRM: брифы, которые клиенты заполняют по ссылке CRM,
// становятся заявкой и брифом в Intelligence; свои шаблоны брифов студии
// уходят в CRM. Без сети и базы — проверяется тестами.
//
// CRM читаем входом самой студии (логин и пароль владельца CRM, хранятся на
// сервере Intelligence): политика доступа CRM отдаёт ровно данные этой студии.

// Публичные адрес и ключ CRM — те же, что видит любой посетитель crm.adervis.ru.
export const CRM_URL = 'https://qzeylogyledmhjpzvgkk.supabase.co';
export const CRM_KEY = 'sb_publishable_E9JgbQiA7namAFiZAAbZEQ_aBn11VgJ';
export const CRM_APP = 'https://crm.adervis.ru/';

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
    sub: 'Анимация, пакет графики для видео и новостей, инфографика, 3D. Ответьте на главное — пришлём расчёт и план работ.',
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

// ------------------------------------------------- бриф Intelligence → сделка CRM
// Клиент и сделка ложатся в состояние CRM так же, как их кладёт бот CRM:
// смета — черновиком botEstimate. Строку сметы собирает сама CRM кнопкой
// «Развернуть смету»: у неё своя математика, вторая копия разошлась бы молча.
export const CRM_STATUSES = ['Лид', 'Бриф', 'КП отправлено', 'Согласование', 'Договор', 'Предоплата', 'В работе', 'Сдано', 'Оплата', 'Завершённые'];
// С этих стадий CRM сделка состоялась: бриф и заявка в Hub переходят в «Сделку».
export const CRM_WON = ['Договор', 'Предоплата', 'В работе', 'Сдано', 'Оплата', 'Завершённые'];
export type PushLine = { name: string; price: number; note: string };
export type PushDeal = { briefId: string; name: string; client: string; contact: string; phone: string; email: string; status: string; total: number; notes: string; lines: PushLine[] };

const str = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export function sanitizePush(raw: unknown): PushDeal {
  const o = (raw ?? {}) as Row;
  const lines = (Array.isArray(o.lines) ? o.lines : []).slice(0, 80)
    .map((l: Row) => ({ name: str(l?.name, 120), price: Math.max(0, Math.round(Number(l?.price) || 0)), note: str(l?.note, 200) }))
    .filter((l: PushLine) => l.name && l.price > 0);
  if (!lines.length) throw new Error('В смете нет строк с ценой — сначала посчитайте смету');
  const briefId = str(o.briefId, 80);
  if (!briefId) throw new Error('Не указан бриф');
  return {
    briefId, lines,
    name: str(o.name, 120) || 'Сделка из Hub ADERVIS', client: str(o.client, 120) || 'Новый клиент', contact: str(o.contact, 120),
    phone: str(o.phone, 40), email: str(o.email, 120).toLowerCase(), status: CRM_STATUSES.includes(String(o.status)) ? String(o.status) : 'Бриф',
    total: lines.reduce((n: number, l: PushLine) => n + l.price, 0), notes: String(o.notes ?? '').trim().slice(0, 2000)
  };
}

const digits = (s: string) => String(s || '').replace(/\D/g, '').slice(-10);
// Смета сделки уже развёрнута в CRM — её строки правят там, мы их не трогаем.
const expanded = (d: Row) => Object.keys(d?.snapshot?.selected || d?.selected || {}).length > 0;

export function withDeal(state: Row, p: PushDeal, ids: { deal: string; client: string }, now: string, knownDealId = '') {
  const s = { ...(state || {}) };
  const clients: Row[] = Array.isArray(s.clients) ? [...s.clients] : [];
  const projects: Row[] = Array.isArray(s.savedProjects) ? [...s.savedProjects] : [];
  let client = clients.find(c => (p.email && String(c.email || '').toLowerCase() === p.email)
    || (digits(p.phone).length === 10 && digits(c.phone) === digits(p.phone))
    || String(c.name || '').toLowerCase() === p.client.toLowerCase());
  const clientCreated = !client;
  if (!client) {
    client = { id: ids.client, name: p.client, company: '', phone: p.phone, email: p.email, city: '', social: '', contactPerson: p.contact,
      source: 'Hub ADERVIS', note: '', requisites: '', status: 'new', createdAt: now, updatedAt: now };
    clients.unshift(client);
  }
  const draft = { source: 'intelligence', createdAt: now, lines: p.lines.map(l => ({ name: l.name, qty: 1, price: l.price, note: l.note })),
    statedTotal: p.total, mismatch: 0, openItems: [] };
  const i = projects.findIndex(d => (knownDealId && d.id === knownDealId) || d.intelBriefId === p.briefId);
  let dealId = ids.deal, mode: 'created' | 'updated' = 'created';
  if (i >= 0) {
    const d = projects[i];
    if (expanded(d)) throw new Error('Смета этой сделки уже развёрнута в CRM — правьте её там');
    dealId = d.id; mode = 'updated';
    projects[i] = { ...d, name: p.name, client: p.client, clientId: client.id, total: p.total, notes: p.notes, botEstimate: draft, intelBriefId: p.briefId, updatedAt: now };
  } else {
    projects.unshift({ id: dealId, name: p.name, client: p.client, clientId: client.id, crmStatus: p.status, total: p.total, paid: 0,
      deadline: '', lines: [], payments: [], expenses: [], tasks: [], team: [], notes: p.notes, botEstimate: draft, intelBriefId: p.briefId,
      createdAt: now, updatedAt: now });
  }
  s.clients = clients; s.savedProjects = projects;
  return { state: s, dealId, mode, clientCreated, clientId: client.id as string };
}

// ------------------------------------------------- сделка CRM → бриф и заявка Hub
// Сделку ищем по номеру, который CRM вернула при отправке, иначе — по отметке брифа.
export type DealBack = { dealId: string; status: string; total: number; paid: number };
const money = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
export function findDeal(state: Row, brief: { id: string; crm_deal_id?: string | null }): DealBack | null {
  const projects: Row[] = Array.isArray(state?.savedProjects) ? state.savedProjects : [];
  const d = (brief.crm_deal_id && projects.find(p => p.id === brief.crm_deal_id)) || projects.find(p => p.intelBriefId === brief.id);
  if (!d) return null;
  return { dealId: String(d.id), status: str(d.crmStatus || d.status, 40), total: money(d.total ?? d.snapshot?.total), paid: money(d.paid ?? d.snapshot?.paid) };
}

// Что поменять в Hub по сделке из CRM. Ничего не изменилось — патчи пустые.
// Стадию брифа и статус заявки только продвигаем вперёд: «Отказ» и ручную
// «Сделку» не трогаем; сумму заявки берём из CRM, когда сделка состоялась.
export function backChanges(brief: Row, lead: Row | null, deal: DealBack, now: string) {
  const briefPatch: Row = {};
  if ((brief.crm_status || '') !== deal.status) briefPatch.crm_status = deal.status;
  if (Number(brief.crm_total ?? -1) !== deal.total) briefPatch.crm_total = deal.total;
  if (Number(brief.crm_paid ?? -1) !== deal.paid) briefPatch.crm_paid = deal.paid;
  if (brief.crm_deal_id !== deal.dealId) briefPatch.crm_deal_id = deal.dealId;
  const won = CRM_WON.includes(deal.status);
  if (won && !['Сделка', 'Отказ'].includes(brief.stage)) briefPatch.stage = 'Сделка';
  if (Object.keys(briefPatch).length) briefPatch.crm_synced_at = now;
  const leadPatch: Row = {};
  if (lead && won && lead.status !== 'Отказ') {
    if (lead.status !== 'Сделка') leadPatch.status = 'Сделка';
    if (deal.total > 0 && Number(lead.amount || 0) !== deal.total) leadPatch.amount = deal.total;
  }
  const paidBefore = Number(brief.crm_paid || 0);
  return {
    briefPatch, leadPatch,
    paidNow: Math.max(0, deal.paid - paidBefore),                          // сколько пришло с прошлой проверки
    becameWon: won && !CRM_WON.includes(brief.crm_status || '')            // сделка только что состоялась
  };
}
