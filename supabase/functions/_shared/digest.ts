// Утренняя сводка «На сегодня» для Telegram — те же правила, что у списка
// «На сегодня» в приложении. Без сети и базы: проверяется тестами.

import { engageLine } from './kp-engage.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export type DigestData = {
  today: string;          // YYYY-MM-DD по пермскому времени
  now: number;            // Date.now()
  leads: Row[];
  prospects: Row[];
  briefs: Row[];
  campaigns: Row[];
  content: Row[];
  newLeads: number;       // заявок за вчера
  inbound: number;        // сообщений клиентов за сутки
  kp?: Row[];             // КП-ссылки: title, client, views, last_view_at, choice, chosen_at, created_at
  stock?: { state: string; data?: Row };   // сводка Adervis Stock (stockSummary)
  appUrl: string;
};

type Item = { title: string; what: string; when: string; late: boolean; kind: string };

const DAY = 864e5;
const dateOf = (iso: string) => new Date(Date.parse(iso) + 5 * 36e5).toISOString().slice(0, 10);
const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many;
const days = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
const RU_MONTH = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const human = (d: string) => `${Number(d.slice(8, 10))} ${RU_MONTH[Number(d.slice(5, 7)) - 1]}`;
const FUNNEL_OPEN = ['Новое', 'В работе', 'КП отправлено'];
const CHANNEL = (p: Row) => p.tg_chat_id ? 'Telegram' : p.vk_peer_id ? 'ВКонтакте' : p.ig_user_id ? 'Instagram' : '';

export function digestItems(d: DigestData): Item[] {
  const t = d.today, out: Item[] = [];
  const ago = (v: string) => v && v.length === 10 ? Math.round((Date.parse(t) - Date.parse(v)) / DAY) : Math.floor((d.now - Date.parse(v)) / DAY);
  const push = (kind: string, title: string, what: string, when: string, late: boolean) => out.push({ kind, title, what, when, late });
  for (const l of d.leads) {
    if (!FUNNEL_OPEN.includes(l.status)) continue;
    if (l.next_on) { if (l.next_on <= t) push('Заявка', l.name, l.next_step || 'Следующий шаг по заявке', l.next_on, l.next_on < t); }
    else if (l.status === 'Новое' && ago(l.came_on) >= 1) push('Заявка', l.name, `Заявка без ответа ${days(ago(l.came_on))}`, l.came_on, true);
    else if (l.status === 'КП отправлено' && l.updated_at && ago(l.updated_at) >= 3) push('Заявка', l.name, `КП без ответа ${days(ago(l.updated_at))} — напомнить`, dateOf(l.updated_at), true);
  }
  for (const p of d.prospects) {
    if (['Заявка', 'Не интересно'].includes(p.status)) continue;
    if (p.next_on) { if (p.next_on <= t) push('Клиент', p.name, p.status === 'Написали' ? 'Напомнить о себе' : 'Вернуться к компании', p.next_on, p.next_on < t); }
    else if (p.status === 'Написали' && p.updated_at && ago(p.updated_at) > 5) push('Клиент', p.name, `Молчат ${days(ago(p.updated_at))} — одно напоминание`, dateOf(p.updated_at), true);
  }
  for (const p of d.prospects.filter(p => CHANNEL(p) && !p.elsewhere && p.last_direction === 'in' && p.bot_mode === 'human' && p.last_message_at)) {
    push('Диалог', p.name, `ждёт ответа в ${CHANNEL(p)}: «${String(p.last_text || '').slice(0, 60)}»`, dateOf(p.last_message_at), (d.now - Date.parse(p.last_message_at)) / 36e5 > 3);
  }
  for (const b of d.briefs.filter(b => b.next_on && b.next_on <= t && !['Сделка', 'Отказ'].includes(b.stage))) {
    push('Бриф', b.title, b.next_step || `Бриф: ${b.stage}`, b.next_on, b.next_on < t);
  }
  for (const c of d.campaigns.filter(c => c.status === 'Идёт' && c.ends_on)) {
    const left = -ago(String(c.ends_on));
    if (left < 0) push('Реклама', c.name, 'Срок кампании вышел — обновите статус и расход', String(c.ends_on), true);
    else if (left <= 2) push('Реклама', c.name, left ? `Заканчивается через ${days(left)}` : 'Заканчивается сегодня', String(c.ends_on), false);
  }
  for (const p of d.content.filter(p => p.publish_on && p.publish_on <= t && p.status !== 'Опубликовано')) {
    push('Публикация', p.title, p.publish_on === t ? `Выходит сегодня в ${p.channel}` : `Должна была выйти ${human(p.publish_on)}`, p.publish_on, p.publish_on < t);
  }
  return out.sort((a, b) => Number(b.late) - Number(a.late) || a.when.localeCompare(b.when));
}

// Adervis Stock: сначала тревоги (движок, поломки, ключи, подписка Envato),
// потом продажи за сутки и деньги за месяц. Ключ не подключён — молчим.
export function stockLines(st?: { state: string; data?: Row }): string[] {
  if (!st || st.state === 'off') return [];
  if (st.state === 'bad_token') return ['• ⚠️ Ключ Stock не подходит: выдайте новый в админке Stock и вставьте в Hub'];
  if (st.state !== 'ok' || !st.data) return ['• ⚠️ stock.adervis.ru не отвечает: клиенты не могут скачивать'];
  const s = st.data, out: string[] = [];
  const rub = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} ₽`;
  if (s.engine?.ok === false) out.push('• ⚠️ Движок Envato не работает: скачивания стоят, проверьте админку Stock');
  for (const p of (s.problems || []).slice(0, 3)) out.push(`• ⚠️ ${p.title}`);
  if (s.envato?.daysLeft != null && s.envato.daysLeft <= 3) out.push(`• ⚠️ Подписка Envato кончается через ${days(s.envato.daysLeft)}`);
  if (s.keysInStock === 0) out.push('• Ключи для продажи закончились: выпустите новые в админке');
  out.push(`• За сутки: ${s.sales?.day ?? 0} ${plural(s.sales?.day ?? 0, 'продажа', 'продажи', 'продаж')}, ${s.newAccounts?.day ?? 0} ${plural(s.newAccounts?.day ?? 0, 'новый клиент', 'новых клиента', 'новых клиентов')}, скачиваний ${s.downloads?.day ?? 0}`);
  out.push(`• За месяц: выручка ${rub(s.money?.revenueMonth)}, прибыль ${rub(s.money?.profitMonth)}, активных подписок ${s.activePlans ?? 0}`);
  return out;
}

// Что клиенты сделали с КП-ссылками за сутки и какие КП давно не открывали.
export function kpLines(d: DigestData): string[] {
  const rub = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} ₽`;
  const fresh = (v?: string) => !!v && d.now - Date.parse(v) < DAY;
  const name = (k: Row) => `«${k.title || 'КП'}»${k.client ? ` (${k.client})` : ''}`;
  const out: string[] = [];
  for (const k of d.kp || []) {
    const c = k.choice;
    if (c && fresh(k.chosen_at)) out.push(c.type === 'budget' ? `• ${name(k)}: клиент предложил бюджет ${rub(c.amount)}` : `• ${name(k)}: клиент выбрал ${c.label || 'вариант'}${c.options?.length ? ` + ${c.options.length}` : ''}, ${rub(c.total)}`);
    else if (fresh(k.last_view_at)) { const how = engageLine(k.engagement); out.push(`• ${name(k)}: КП открыли, всего ${k.views} ${plural(k.views, 'раз', 'раза', 'раз')}${how ? `; ${how}` : ''}`); }
    else if (!k.views && k.created_at && d.now - Date.parse(k.created_at) >= 3 * DAY) out.push(`• ${name(k)}: КП не открывали ${days(Math.floor((d.now - Date.parse(k.created_at)) / DAY))}, стоит переспросить`);
  }
  return out.slice(0, 6);
}

// Текст для Telegram: просроченное — первым, не больше 12 дел, ссылка в приложение.
export function digestText(d: DigestData): string {
  const items = digestItems(d);
  const late = items.filter(x => x.late), now = items.filter(x => !x.late);
  const line = (x: Item) => `• ${x.title} — ${x.what}${x.late ? ` (с ${human(x.when)})` : ''}`;
  const shown = [...late, ...now].slice(0, 12);
  const lines = [`☀️ На сегодня, ${human(d.today)}: ${items.length ? `${items.length} ${plural(items.length, 'дело', 'дела', 'дел')}${late.length ? `, просрочено ${late.length}` : ''}` : 'срочного нет'}`];
  const lateShown = shown.filter(x => x.late), nowShown = shown.filter(x => !x.late);
  if (lateShown.length) lines.push('', '🔴 Просрочено', ...lateShown.map(line));
  if (nowShown.length) lines.push('', '📌 Сегодня', ...nowShown.map(line));
  if (items.length > shown.length) lines.push(`…и ещё ${items.length - shown.length} — в приложении`);
  if (!items.length) lines.push('', 'Хорошее время написать новым компаниям из «Поиска клиентов».');
  const kp = kpLines(d);
  if (kp.length) lines.push('', '📨 КП', ...kp);
  const stock = stockLines(d.stock);
  if (stock.length) lines.push('', '🧩 Adervis Stock', ...stock);
  lines.push('', `📈 За сутки: ${d.newLeads} ${plural(d.newLeads, 'новая заявка', 'новые заявки', 'новых заявок')}, ${d.inbound} ${plural(d.inbound, 'сообщение', 'сообщения', 'сообщений')} от клиентов`);
  lines.push(d.appUrl);
  return lines.join('\n').slice(0, 4000);
}

// Пермский час и дата — сводка уходит в выбранный час по местному времени.
export const permNow = (now: number) => {
  const d = new Date(now + 5 * 36e5);
  return { hour: d.getUTCHours(), date: d.toISOString().slice(0, 10) };
};
