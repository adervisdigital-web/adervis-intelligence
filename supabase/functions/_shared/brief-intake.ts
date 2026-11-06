// Бриф со страницы hub.adervis.ru/brief.html → заявка в воронке и бриф на разбор.
// Брифы живут в Hub, а не в CRM: в CRM клиент уходит из Hub, только когда готов
// платить (выбрал вариант КП). Без сети и базы — проверяется тестами.

import { fingerprint } from './site.ts';

// Типы брифов: номер в ссылке → название. Вопросы живут на странице (brief.js),
// сюда приходят готовые пары «вопрос — ответ».
export const BRIEF_TYPES: Record<string, string> = {
  video: 'Видео', photo: 'Фото', design: 'Дизайн', ai: 'ИИ: ролики и фото нейросетями', site: 'Сайт или приложение', other: 'Другая задача',
  // старые ссылки (до 07.11.2026)
  '3d': '3D-ролик о продукте', motion: 'Моушн и графика', shoot: 'Съёмка и мероприятия', content: 'Контент на месяц'
};
// откуда пришёл человек: метка в ссылке (?src=tg) → источник заявки
const SOURCES: Record<string, string> = { tg: 'Telegram', vk: 'ВКонтакте', site: 'Сайт', mail: 'Почта', ig: 'Instagram' };

const clean = (s: unknown, n: number) => String(s ?? '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

export type BriefItem = { q: string; a: string };

// Проверка присланного брифа: тип из списка, имя и контакт, хотя бы один
// содержательный ответ, ловушка для ботов пустая. Не прошёл — null.
export function briefIntakeOf(body: any, today: string) {
  if (!body || typeof body !== 'object') return null;
  if (clean(body.website, 200)) return null;                                     // ловушка: люди это поле не видят
  const type = clean(body.type, 20), label = BRIEF_TYPES[type];
  if (!label) return null;
  const name = clean(body.name, 120), contact = clean(body.contact, 200);
  if (!name || contact.length < 3) return null;
  const items: BriefItem[] = (Array.isArray(body.items) ? body.items : []).slice(0, 30)
    .map((x: any) => ({ q: clean(x?.q, 240), a: clean(x?.a, 3000) })).filter((x: BriefItem) => x.q && x.a);
  if (!items.length) return null;
  const src = SOURCES[clean(body.src, 10)] || '';
  const find = (re: RegExp) => items.find(x => re.test(x.q))?.a || '';
  const budget = find(/бюджет/i), deadline = find(/срок/i);
  const main = items.find(x => x.a.length > 15 && !/бюджет|срок|с чем помочь/i.test(x.q))?.a || items.find(x => !/с чем помочь/i.test(x.q))?.a || items[0].a;
  const text = [
    `Бриф с hub.adervis.ru · ${label} · ${today}${src ? ` · пришёл из ${src}` : ''}`,
    `Клиент: ${name} · ${contact}`, '',
    ...items.flatMap(x => [x.q, x.a, ''])
  ].join('\n').trim();
  const fp = fingerprint(`${type}|${contact}|${items.map(x => x.a).join('|')}`);
  const leadId = `brief-${today}-${fp}`;
  return {
    label, budget, deadline,
    lead: {
      id: leadId, came_on: today, name: `${name}: ${label}`.slice(0, 200), source: src ? `Бриф Hub · ${src}` : 'Бриф Hub', direction: 'Студия',
      request: `${label}: ${main}`.replace(/\s+/g, ' ').slice(0, 1000), amount: 0, status: 'Новое',
      note: [`Заполнил бриф на hub.adervis.ru. Контакт: ${contact}`, budget && `Бюджет: ${budget}`, deadline && `Сроки: ${deadline}`].filter(Boolean).join('\n').slice(0, 1000),
      reached: 0, next_step: 'Разобрать бриф и ответить клиенту', next_on: today, lost_reason: ''
    },
    brief: {
      id: `bf-${today}-${fp}`, lead_id: leadId, title: `${label}: ${name}`.slice(0, 200), client: name, stage: 'Разбор',
      source_text: text.slice(0, 60000), next_step: 'Разобрать бриф, задать вопросы, посчитать КП', next_on: today
    },
    notify: [`📋 Новый бриф: ${label}`, `👤 ${name} · ${contact}`, budget && `💰 ${budget}`, deadline && `⏱ ${deadline}`,
      `📝 ${main.replace(/\s+/g, ' ').slice(0, 300)}`, 'Открыть: «Брифы и КП» в Hub ADERVIS'].filter(Boolean).join('\n')
  };
}
