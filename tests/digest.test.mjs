// Утренняя сводка: те же правила, что «На сегодня» в приложении.
import { digestItems, digestText, permNow, stockLines } from '../supabase/functions/_shared/digest.ts';
import { cloudForecast, cloudFromApi, payback, watchAlerts } from '../supabase/functions/_shared/stock-watch.ts';

let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  -> ' + extra : '')); };

const now = Date.parse('2026-10-20T04:00:00Z'); // 9:00 в Перми
const base = { today: '2026-10-20', now, leads: [], prospects: [], briefs: [], campaigns: [], content: [], newLeads: 0, inbound: 0, appUrl: 'https://app' };

const d = {
  ...base, newLeads: 2, inbound: 7,
  leads: [
    { name: 'Химпром', status: 'В работе', next_on: '2026-10-19', next_step: 'Вопросы по ТЗ' },
    { name: 'Кофейня', status: 'Новое', came_on: '2026-10-18', next_on: null },
    { name: 'Завод', status: 'КП отправлено', next_on: null, updated_at: '2026-10-15T10:00:00Z' },
    { name: 'Сделка', status: 'Сделка', next_on: '2026-10-01' },
    { name: 'Завтра', status: 'В работе', next_on: '2026-10-21' }
  ],
  prospects: [
    { name: 'Анастасия', status: 'Ответили', vk_peer_id: 1, bot_mode: 'human', last_direction: 'in', last_text: 'Когда будет КП?', last_message_at: '2026-10-19T12:00:00Z' },
    { name: 'Бот ведёт', status: 'Ответили', tg_chat_id: 2, bot_mode: 'bot', last_direction: 'in', last_message_at: '2026-10-19T12:00:00Z' },
    { name: 'Клиника', status: 'Написали', next_on: '2026-10-20' }
  ],
  briefs: [{ title: 'Видеодайджест', stage: 'Вопросы', next_on: '2026-10-20', next_step: 'Отправить вопросы' }, { title: 'Закрыт', stage: 'Сделка', next_on: '2026-10-01' }],
  campaigns: [{ name: 'ВК осень', status: 'Идёт', ends_on: '2026-10-21' }],
  content: [{ title: 'Пост про Stock', status: 'Готово', publish_on: '2026-10-20', channel: 'Telegram' }]
};
const items = digestItems(d);
check('в сводку попадает то же, что в «На сегодня»', items.length === 8, items.map(x => x.title).join(', '));
check('закрытые заявки, брифы и будущие шаги — не попадают', !items.some(x => ['Сделка', 'Закрыт', 'Завтра'].includes(x.title)));
check('диалог, где отвечает бот, — не дело', !items.some(x => x.title === 'Бот ведёт'));
check('просроченное — первым', items[0].late && items.findIndex(x => !x.late) > items.findLastIndex(x => x.late));
check('КП без ответа 4 дня — напомнить', items.some(x => x.title === 'Завод' && x.what.includes('4 дня')));
const text = digestText(d);
check('текст: дата, счёт дел, разделы', text.startsWith('☀️ На сегодня, 20 октября: 8 дел, просрочено 4') && text.includes('🔴 Просрочено') && text.includes('📌 Сегодня'), text.split('\n')[0]);
check('текст: итоги суток и ссылка', text.includes('2 новые заявки, 7 сообщений от клиентов') && text.trim().endsWith('https://app'));
{
  // КП за сутки: выбор, бюджет, просмотры и давно не открытые
  const H = 36e5, now = Date.parse('2026-10-24T09:00:00Z');
  const kpDay = digestText({ ...base, now, kp: [
    { title: 'Дайджест', client: 'Химпром', views: 3, last_view_at: new Date(now - 2 * H).toISOString(), choice: { label: 'Полный вариант', options: [], total: 360000 }, chosen_at: new Date(now - H).toISOString() },
    { title: 'Ролики', client: 'СтройГрупп', views: 1, last_view_at: new Date(now - 3 * H).toISOString(), choice: { type: 'budget', amount: 500000 }, chosen_at: new Date(now - 3 * H).toISOString() },
    { title: 'Графика', client: 'UNIX', views: 2, last_view_at: new Date(now - 5 * H).toISOString() },
    { title: 'Старое', client: 'Кто-то', views: 0, created_at: new Date(now - 4 * 24 * H).toISOString() },
    { title: 'Вчерашнее', views: 1, last_view_at: new Date(now - 30 * H).toISOString() }] });
  check('сводка: блок «КП» — выбор, бюджет, просмотры, давно не открыли; старые просмотры не шумят', kpDay.includes('📨 КП') && /Химпром\): клиент выбрал Полный вариант, 360\s000 ₽/.test(kpDay)
    && /клиент предложил бюджет 500\s000 ₽/.test(kpDay) && kpDay.includes('UNIX): КП открыли, всего 2 раза') && kpDay.includes('КП не открывали 4 дня') && !kpDay.includes('Вчерашнее'), kpDay);
}
check('пустой день — подсказка', digestText(base).includes('срочного нет') && digestText(base).includes('Поиска клиентов'));
const many = digestText({ ...base, leads: Array.from({ length: 20 }, (_, i) => ({ name: 'Л' + i, status: 'В работе', next_on: '2026-10-20' })) });
check('больше 12 дел — остальные «в приложении»', many.includes('…и ещё 8'));
const away = digestItems({ ...base, prospects: [{ name: 'В личке', status: 'Ответили', vk_peer_id: 3, bot_mode: 'human', elsewhere: 'ВК, личная страница', last_direction: 'in', last_message_at: '2026-10-18T12:00:00Z' }] });
check('ушёл в личную переписку — не «ждёт ответа» и не просрочено', away.length === 0);
check('пермский час', permNow(now).hour === 9 && permNow(Date.parse('2026-10-20T20:30:00Z')).date === '2026-10-21');


// Adervis Stock в утренней сводке: тревоги первыми, ключ не подключён — молчим
const okStock = { state: 'ok', data: { engine: { ok: true }, problems: [], envato: { daysLeft: 12 }, keysInStock: 8, sales: { day: 2 }, newAccounts: { day: 1 }, downloads: { day: 14 },
  money: { revenueMonth: 4500, profitMonth: 1500 }, activePlans: 6 } };
check('Stock: ключ не подключён — блока нет', stockLines({ state: 'off' }).length === 0 && stockLines(undefined).length === 0);
check('Stock: всё в порядке — продажи за сутки и деньги за месяц, без тревог', stockLines(okStock).join('|').replace(/\s/g, ' ') === '• За сутки: 2 продажи, 1 новый клиент, скачиваний 14|• За месяц: выручка 4 500 ₽, прибыль 1 500 ₽, активных подписок 6', stockLines(okStock).join('|'));
const badStock = stockLines({ state: 'ok', data: { ...okStock.data, engine: { ok: false }, problems: [{ title: 'Прокси не отвечает' }], envato: { daysLeft: 2 }, keysInStock: 0 } });
check('Stock: движок, поломка, подписка Envato и ключи — тревогами впереди', badStock[0].includes('Движок Envato не работает') && badStock[1] === '• ⚠️ Прокси не отвечает'
  && badStock[2].includes('через 2 дня') && badStock[3].includes('Ключи для продажи закончились'), badStock.join(' | '));
check('Stock: сайт не отвечает и неверный ключ — понятными словами', stockLines({ state: 'down' })[0].includes('не отвечает') && stockLines({ state: 'bad_token' })[0].includes('Ключ Stock не подходит'));
// облако рег.ру и окупаемость Stock
const AT = '2026-11-02T12:00:00Z', atMs = Date.parse(AT);
const cf = cloudForecast({ balance: 182.93, hourly: 1.60193, at: AT }, atMs + 24 * 36e5);
check('облако: остаток считается на сейчас, срок по часам', cf.state === 'manual' && Math.abs(cf.balance - 144.48) < 0.02 && cf.daysLeft === 3 && cf.hoursLeft === 90, JSON.stringify(cf));
check('облако: без записанного баланса прогноза нет', cloudForecast({}, atMs).state === 'off' && cloudForecast(undefined, atMs).state === 'off');
const api = cloudFromApi({ balance_data: { balance: 500, bonus_balance: 10, days_left: 12, hours_left: 300, hourly_cost: 1.6, monthly_cost: 1169, detalization: [{ name: 'stock', state: 'active', price_month: '982.03' }] } }, atMs);
check('облако: ответ API разбирается', api.state === 'ok' && api.daysLeft === 12 && api.resources[0].monthly === 982.03 && api.runoutAt === atMs + 300 * 36e5);
check('облако: неожиданный ответ не ломает', cloudFromApi({}, atMs).state === 'error');
const low = { daysLeft: 4, balance: 182.93, runoutAt: Date.parse('2026-11-07T06:00:00Z') };
const noon = Date.parse('2026-11-02T07:00:00Z'), night = Date.parse('2026-11-02T20:00:00Z');
const w1 = watchAlerts({ state: 'ok' }, low, {}, noon);
check('тревога: денег мало — сообщение со сроком', w1.messages.length === 1 && w1.messages[0].includes('183 ₽') && w1.messages[0].includes('4 дня') && w1.messages[0].includes('7 ноября'), w1.messages[0]);
check('тревога: второй раз за день не повторяем', watchAlerts({ state: 'ok' }, low, w1.watch, noon + 36e5).messages.length === 0);
check('тревога: ночью не будим', watchAlerts({ state: 'ok' }, low, {}, night).messages.length === 0);
check('тревога: денег хватает — молчим', watchAlerts({ state: 'ok' }, { ...low, daysLeft: 6 }, {}, noon).messages.length === 0);
const d1 = watchAlerts({ state: 'down' }, undefined, {}, noon), d2 = watchAlerts({ state: 'down' }, undefined, d1.watch, noon), d3 = watchAlerts({ state: 'down' }, undefined, d2.watch, noon);
check('сайт: один сбой не тревога, второй подряд тревога, дальше тишина', d1.messages.length === 0 && d2.messages.length === 1 && d3.messages.length === 0);
const back = watchAlerts({ state: 'ok' }, undefined, d3.watch, noon);
check('сайт: вернулся — сообщаем и обнуляем счёт', back.messages[0].includes('снова работает') && back.watch.miss === 0 && !back.watch.down);
const bl = watchAlerts({ state: 'down' }, { balance: 0, daysLeft: 0, runoutAt: noon }, d1.watch, night);
check('сайт: упал при пустом счёте — называем причину', bl.messages[0].includes('кончились деньги'));
const econ = { revenueAll: 3190, salesAll: 7, fixedMonthly: 4000, last30: { sales: 6, revenue: 2700 }, months: [{ profit: -3510 }, { profit: -1300 }] };
const pb = payback(econ);
check('окупаемость: накопленный итог, продажи для нуля, темп ниже расходов — срока нет', pb.total === -4810 && pb.months[1].total === -4810 && pb.needSales === 9 && pb.check === 456 && pb.gap === -1300 && pb.monthsLeft === null, JSON.stringify(pb));
check('окупаемость: темп выше расходов — считаем месяцы', payback({ ...econ, last30: { sales: 20, revenue: 6000 } }).monthsLeft === 3);
check('окупаемость: уже в плюсе и старая сводка без данных', payback({ ...econ, months: [{ profit: 100 }] }).monthsLeft === 0 && payback(undefined) === null);
check('сводка: облако первой строкой, предупреждение при малом остатке', stockLines({ ...okStock, cloud: low })[0].includes('⚠️ Облако рег.ру: денег на 4 дня')
  && stockLines({ state: 'off', cloud: { daysLeft: 20, runoutAt: noon } })[0].startsWith('• Облако рег.ру'));
check('сводка: неделя без продаж заметна', stockLines({ state: 'ok', data: { ...okStock.data, sales: { day: 0, week: 0 } } }).join('|').includes('ни одной продажи'));

check('Stock: блок в тексте сводки', digestText({ ...base, stock: okStock }).includes('🧩 Adervis Stock'));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
