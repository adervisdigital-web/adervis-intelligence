// Рекламные кабинеты → Hub: расход, показы и клики по кампаниям за 30 дней
// из VK Рекламы и Яндекс Директа в ad_stats; связанные кампании Hub получают
// расход оттуда. Запускают участники из раздела «Реклама» (action: sync /
// status) и расписание раз в сутки (x-digest-secret). Ключи — в channel_secrets.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import { admin, secret, sameSecret, json, CORS, SUPABASE_URL, PUBLIC_KEY, type Sb } from '../_shared/outreach.ts';
import { parseDirectTsv, directReportBody, parseVkStats, linkedSpent, isoDay, type StatRow } from '../_shared/ads.ts';

const VK = 'https://ads.vk.com/api/v2';
const DIRECT = 'https://api.direct.yandex.com/json/v5/reports';
const DAYS = 30;

async function keep(sb: Sb, name: string, value: string) {
  await sb.from('channel_secrets').upsert({ name, value, updated_by: 'ads-sync' }, { onConflict: 'name' });
}

// Токен VK живёт сутки, а выдать их можно лишь несколько — храним и продлеваем.
async function vkToken(sb: Sb, id: string, sec: string): Promise<string> {
  let t: { access_token?: string; refresh_token?: string; expires_at?: number } = {};
  try { t = JSON.parse(await secret(sb, 'vkads_token') || '{}'); } catch { t = {}; }
  if (t.access_token && (t.expires_at || 0) > Date.now() + 120e3) return t.access_token;
  const ask = async (body: Record<string, string>) => {
    const r = await fetch(`${VK}/oauth2/token.json`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...body, client_id: id, client_secret: sec }), signal: AbortSignal.timeout(20_000) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.access_token ? j : null;
  };
  const got = (t.refresh_token && await ask({ grant_type: 'refresh_token', refresh_token: t.refresh_token })) || await ask({ grant_type: 'client_credentials' });
  if (!got) throw new Error('VK Реклама не выдала доступ: проверьте client_id и client_secret');
  await keep(sb, 'vkads_token', JSON.stringify({ access_token: got.access_token, refresh_token: got.refresh_token || t.refresh_token || '', expires_at: Date.now() + (Number(got.expires_in) || 86400) * 1000 }));
  return got.access_token;
}

async function vkRows(sb: Sb, from: string, to: string): Promise<StatRow[] | null> {
  const id = await secret(sb, 'vkads_client_id'), sec = await secret(sb, 'vkads_client_secret');
  if (!id || !sec) return null;
  const token = await vkToken(sb, id, sec);
  const get = async (path: string) => {
    const r = await fetch(`${VK}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`VK Реклама ответила ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return r.json();
  };
  const plans = await get('/ad_plans.json?limit=250&fields=id,name,status');
  const names: Record<string, string> = Object.fromEntries((plans.items || []).map((p: any) => [String(p.id), String(p.name || '')]));
  const ids = Object.keys(names), rows: StatRow[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const stats = await get(`/statistics/ad_plans/day.json?id=${ids.slice(i, i + 50).join(',')}&date_from=${from}&date_to=${to}&metrics=base`);
    rows.push(...parseVkStats(stats, names));
  }
  return rows;
}

// Отчёт Директа готовится в фоне: 201/202 — ждём, сколько сказано в retryIn.
async function directRows(sb: Sb, from: string, to: string): Promise<StatRow[] | null> {
  const token = await secret(sb, 'yadirect_token');
  if (!token) return null;
  const login = await secret(sb, 'yadirect_login');
  const body = JSON.stringify(directReportBody(from, to));
  for (let i = 0; i < 8; i++) {
    const r = await fetch(DIRECT, { method: 'POST', body, signal: AbortSignal.timeout(60_000), headers: {
      Authorization: `Bearer ${token}`, 'Accept-Language': 'ru', 'Content-Type': 'application/json; charset=utf-8',
      processingMode: 'auto', returnMoneyInMicros: 'false', skipReportHeader: 'true', skipReportSummary: 'true',
      ...(login ? { 'Client-Login': login } : {}) } });
    if (r.status === 200) return parseDirectTsv(await r.text());
    if (r.status === 201 || r.status === 202) { await new Promise(res => setTimeout(res, Math.min(15, Number(r.headers.get('retryIn')) || 5) * 1000)); continue; }
    const err = await r.json().catch(() => null);
    throw new Error(`Яндекс Директ: ${err?.error?.error_string || r.status}${err?.error?.error_detail ? `, ${err.error.error_detail}` : ''}`);
  }
  throw new Error('Яндекс Директ долго готовит отчёт, попробуйте через пару минут');
}

async function sync(sb: Sb) {
  const to = isoDay(Date.now()), from = isoDay(Date.now() - (DAYS - 1) * 864e5);
  const state: Record<string, unknown> = {};
  const all: StatRow[] = [];
  for (const [net, load] of [['vk', vkRows], ['direct', directRows]] as const) {
    try {
      const rows = await load(sb, from, to);
      if (!rows) { state[net] = { off: true }; continue; }
      all.push(...rows);
      state[net] = { ok: true, at: new Date().toISOString(), rows: rows.length, campaigns: new Set(rows.map(r => r.ext_id)).size };
    } catch (e) {
      state[net] = { ok: false, at: new Date().toISOString(), error: e instanceof Error ? e.message.slice(0, 300) : 'ошибка' };
    }
  }
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await sb.from('ad_stats').upsert(all.slice(i, i + 500).map(r => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'network,ext_id,day' });
    if (error) throw new Error('не сохранилась статистика: ' + error.message);
  }
  // расход связанных кампаний Hub — из кабинета
  const { data: linked } = await sb.from('campaigns').select('id,ext_network,ext_id,starts_on,ends_on,spent').not('ext_id', 'is', null);
  if (linked?.length) {
    const { data: stats } = await sb.from('ad_stats').select('network,ext_id,day,spent');
    for (const c of linked) {
      const spent = linkedSpent((stats || []) as StatRow[], c);
      if (spent != null && spent !== Number(c.spent)) await sb.from('campaigns').update({ spent }).eq('id', c.id);
    }
  }
  await sb.from('outreach_settings').update({ ads_sync: state }).eq('id', 'main');
  return state;
}

async function status(sb: Sb) {
  const { data: keys } = await sb.from('channel_secrets').select('name').in('name', ['vkads_client_id', 'vkads_client_secret', 'yadirect_token', 'yadirect_login']);
  const has = new Set((keys || []).map((k: any) => k.name));
  const { data: st } = await sb.from('outreach_settings').select('ads_sync').eq('id', 'main').maybeSingle();
  return { vk: has.has('vkads_client_id') && has.has('vkads_client_secret'), direct: has.has('yadirect_token'), directLogin: has.has('yadirect_login'), sync: st?.ads_sync || {} };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  const sb = admin();
  try {
    // расписание: секрет в заголовке
    const cron = req.headers.get('x-digest-secret');
    if (cron) {
      if (!sameSecret(cron, await secret(sb, 'digest_secret'))) return json({ error: 'forbidden' }, 401);
      return json(await sync(sb));
    }
    const auth = req.headers.get('Authorization');
    if (!auth || !PUBLIC_KEY) return json({ error: 'Нужен вход в систему' }, 401);
    const user = createClient(SUPABASE_URL, PUBLIC_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user: me } } = await user.auth.getUser();
    if (!me) return json({ error: 'Нужен вход в систему' }, 401);
    const { data: allowed } = await user.rpc('is_member');
    if (allowed !== true) return json({ error: 'Нет доступа' }, 403);
    const body = await req.json().catch(() => ({}));
    if (body?.action === 'sync') { await sync(sb); return json(await status(sb)); }
    return json(await status(sb));
  } catch (e) {
    console.error('ads-sync:', e);
    return json({ error: e instanceof Error ? e.message : 'Выгрузка не удалась' }, 500);
  }
});
