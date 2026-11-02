// Слежение за Adervis Stock: сколько проживёт облако рег.ру, окупаемость и
// какие тревоги отправить. Только расчёты, без обращений к сети и базе.

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export const CLOUD_LOW_DAYS = 5;
const HOUR = 36e5, PERM = 5 * HOUR;

const permDay = (ts: number) => new Date(ts + PERM).toISOString().slice(0, 10);
const permHour = (ts: number) => new Date(ts + PERM).getUTCHours();
const dateRu = (ts: number) => new Date(ts + PERM).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const rub = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} ₽`;
const dayWord = (n: number) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'день' : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? 'дня' : 'дней'; };

// Баланс, записанный вручную: списания идут почасово, поэтому считаем остаток на сейчас.
export function cloudForecast(m: Row | undefined, now: number) {
  const hourly = Number(m?.hourly) || 0, at = Date.parse(m?.at ?? '');
  if (!hourly || !Number.isFinite(at) || m?.balance == null) return { state: 'off' };
  const balance = Math.max(0, Number(m.balance) - hourly * (now - at) / HOUR);
  const hoursLeft = balance / hourly;
  return { state: 'manual', balance: Math.round(balance * 100) / 100, hourly, monthly: Math.round(hourly * 730), hoursLeft: Math.floor(hoursLeft),
    daysLeft: Math.floor(hoursLeft / 24), runoutAt: now + hoursLeft * HOUR, checkedAt: m.at };
}

// Ответ /v1/balance_data облака рег.ру.
export function cloudFromApi(res: Row, now: number) {
  const b = res?.balance_data;
  if (!b) return { state: 'error' };
  const hoursLeft = Number(b.hours_left) || 0;
  return { state: 'ok', balance: Number(b.balance) || 0, bonus: Number(b.bonus_balance) || 0, hourly: Number(b.hourly_cost) || 0,
    monthly: Number(b.monthly_cost) || 0, hoursLeft, daysLeft: Number(b.days_left) || 0, runoutAt: now + hoursLeft * HOUR, checkedAt: new Date(now).toISOString(),
    resources: (b.detalization ?? []).map((r: Row) => ({ name: r.name, state: r.state, monthly: Number(r.price_month) || 0 })) };
}

// Окупаемость: накопленный итог по месяцам, сколько продаж нужно и когда отобьёмся при нынешнем темпе.
export function payback(e?: Row) {
  if (!e) return null;
  let total = 0;
  const months = (e.months ?? []).map((m: Row) => ({ ...m, total: (total += Number(m.profit) || 0) }));
  const fixed = Number(e.fixedMonthly) || 0, check = e.salesAll ? Math.round(e.revenueAll / e.salesAll) : 0;
  const run = Number(e.last30?.revenue) || 0, gap = run - fixed, debt = Math.max(0, -total);
  return { months, total, debt, fixed, check, run, runSales: Number(e.last30?.sales) || 0, gap,
    needSales: check ? Math.ceil(fixed / check) : null,
    monthsLeft: debt === 0 ? 0 : gap > 0 ? Math.ceil(debt / gap) : null };
}

// Что написать руководителям. Сбой сайта считаем со второй проверки подряд:
// один пропущенный ответ не повод будить. О деньгах напоминаем раз в день, не ночью.
export function watchAlerts(stock: Row, cloud: Row | undefined, watch: Row, now: number) {
  const w = { ...watch }, messages: string[] = [];
  if (stock.state === 'down') {
    w.miss = (Number(w.miss) || 0) + 1;
    if (w.miss === 2) {
      w.down = now;
      messages.push('🔴 stock.adervis.ru не отвечает уже две проверки: клиенты не могут войти и скачивать.' + (cloud?.balance === 0 ? ' На облаке рег.ру кончились деньги.' : ''));
    }
  } else if (stock.state === 'ok') {
    if (w.down) messages.push('🟢 stock.adervis.ru снова работает.');
    w.miss = 0;
    delete w.down;
  }
  const left = cloud?.daysLeft;
  if (left != null && left <= CLOUD_LOW_DAYS && w.cloudDay !== permDay(now) && permHour(now) >= 9) {
    w.cloudDay = permDay(now);
    messages.push(`☁️ Облако рег.ру: на счёте ${rub(cloud!.balance)}, хватит на ${left} ${dayWord(left)}, до ${dateRu(cloud!.runoutAt)}. Пополните счёт, иначе Stock выключится.`);
  }
  return { messages, watch: w };
}

export function cloudLine(cloud?: Row): string[] {
  if (cloud?.daysLeft == null) return [];
  const until = `${cloud.daysLeft} ${dayWord(cloud.daysLeft)}, до ${dateRu(cloud.runoutAt)}`;
  return [cloud.daysLeft <= CLOUD_LOW_DAYS ? `• ⚠️ Облако рег.ру: денег на ${until}, пополните счёт` : `• Облако рег.ру: денег на ${until}`];
}
