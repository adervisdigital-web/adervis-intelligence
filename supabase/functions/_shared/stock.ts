// Связь с Adervis Stock (stock.adervis.ru): сводка по ключу «только для чтения»
// из админки Stock — клиенты, продажи, деньги, подписка Envato, движок, поломки.

import { secret, type Sb } from './outreach.ts';

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
