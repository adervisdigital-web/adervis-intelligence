// Связь с Adervis Stock (stock.adervis.ru): сводка по ключу «только для чтения»
// из админки Stock — клиенты, продажи, деньги, подписка Envato, движок, поломки.

import { secret, type Sb } from './outreach.ts';
import { cloudForecast, cloudFromApi, payback, watchAlerts } from './stock-watch.ts';

export const STOCK_URL = 'https://stock.adervis.ru';

export async function stockSummary(sb: Sb): Promise<{ state: 'off' | 'bad_token' | 'down' | 'ok'; data?: Record<string, any> }> {
  const key = await secret(sb, 'stock_hub_token');
  if (!key) return { state: 'off' };
  try {
    const r = await fetch(`${STOCK_URL}/api/hub/summary`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (r.status === 401) return { state: 'bad_token' };
    if (!r.ok) return { state: 'down' };
    return { state: 'ok', data: await r.json() };
  } catch {
    return { state: 'down' };
  }
}

// Облако рег.ру: по ключу API, а без него по балансу, записанному вручную.
export async function cloudStatus(sb: Sb, now = Date.now()) {
  const manual = async () => {
    const { data } = await sb.from('outreach_settings').select('stock_cloud').eq('id', 'main').maybeSingle();
    return cloudForecast(data?.stock_cloud, now);
  };
  const key = await secret(sb, 'regcloud_token');
  if (!key) return manual();
  try {
    const r = await fetch('https://api.cloudvps.reg.ru/v1/balance_data', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (r.status === 401 || r.status === 403) return { ...await manual(), keyBad: true };
    if (r.ok) return cloudFromApi(await r.json(), now);
  } catch { /* облако не ответило: покажем прогноз по последнему балансу */ }
  return { ...await manual(), keyFailed: true };
}

// Сводка для раздела Stock: сам Stock, облако и окупаемость.
export async function stockPanel(sb: Sb) {
  const [st, cloud] = await Promise.all([stockSummary(sb), cloudStatus(sb)]);
  return { ...st, cloud, payback: payback(st.data?.economy) };
}

// Проверка по расписанию: снимок за день и тревоги руководителям.
export async function stockWatch(sb: Sb, tell: (text: string) => Promise<void>, now = Date.now()) {
  const [st, cloud] = await Promise.all([stockSummary(sb), cloudStatus(sb, now)]);
  const { data } = await sb.from('outreach_settings').select('stock_watch').eq('id', 'main').maybeSingle();
  const { messages, watch } = watchAlerts(st, cloud, data?.stock_watch ?? {}, now);
  for (const m of messages) await tell(m);
  await sb.from('outreach_settings').update({ stock_watch: watch }).eq('id', 'main');
  const day = new Date(now + 5 * 36e5).toISOString().slice(0, 10);
  await sb.from('stock_snapshots').upsert({ day, at: new Date(now).toISOString(), state: st.state, data: st.data ?? null, cloud });
  return { state: st.state, cloud: cloud.state, sent: messages.length };
}
