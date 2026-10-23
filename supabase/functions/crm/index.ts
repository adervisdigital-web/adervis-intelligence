// Связь с ADERVIS CRM.
// Из приложения (только для участников): подключить вход в CRM, статус и
// ссылки на брифы, подтянуть новые брифы, записать шаблоны брифов ADERVIS,
// отправить бриф со сметой в CRM — клиентом и сделкой.
// По расписанию (секрет расписания, как у сводки): подтянуть новые брифы.
// В CRM ходим входом самой студии — её политика доступа отдаёт только
// данные этой студии; код CRM не меняем.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import { admin, secret, settings, json, CORS, SUPABASE_URL, PUBLIC_KEY, sameSecret, permToday, type Sb } from '../_shared/outreach.ts';
import { CRM_URL, CRM_KEY, CRM_TYPES, ADERVIS_TEMPLATES, briefLink, withTemplates, fromSubmission, maskEmail, sanitizePush, withDeal } from '../_shared/crm.ts';
import { sendDigest, INTEL_TOKEN } from '../_shared/digest-run.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  const sb = admin();
  try {
    const body = await req.json().catch(() => ({}));
    // расписание: только «подтянуть», по секрету
    const cron = req.headers.get('x-digest-secret');
    if (cron !== null) {
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

    switch (body?.action) {
      case 'connect': return json(await connect(sb, String(body.email ?? ''), String(body.password ?? '')));
      case 'status': return json(await status(sb));
      case 'sync': return json(await sync(sb));
      case 'templates': return json(await templates(sb));
      case 'push': return json(await push(sb, body.deal));
      case 'disconnect':
        await sb.from('channel_secrets').delete().in('name', ['crm_email', 'crm_password']);
        await sb.from('outreach_settings').update({ crm_login: '', crm_agency_id: '' }).eq('id', 'main');
        return json({ ok: true });
      default: return json({ error: 'Неизвестное действие' }, 400);
    }
  } catch (e) {
    console.error('crm:', e);
    return json({ error: e instanceof Error ? e.message : 'Неизвестная ошибка' }, 400);
  }
});

// Вход в CRM от имени студии; номер студии — как его считает сама CRM.
async function session(sb: Sb, email?: string, password?: string) {
  email = email || await secret(sb, 'crm_email');
  password = password || await secret(sb, 'crm_password');
  if (!email || !password) throw new Error('CRM не подключена — введите вход в CRM');
  const crm = createClient(CRM_URL, CRM_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await crm.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error('CRM не приняла вход: проверьте почту и пароль');
  const { data: profile } = await crm.from('profiles').select('agency_id').eq('id', data.user.id).maybeSingle();
  return { crm, agency: String(profile?.agency_id || data.user.id), token: data.session?.access_token || '' };
}

async function connect(sb: Sb, email: string, password: string) {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email) || password.length < 6) throw new Error('Введите почту и пароль от ADERVIS CRM');
  const { agency } = await session(sb, email, password);
  await sb.from('channel_secrets').upsert([{ name: 'crm_email', value: email }, { name: 'crm_password', value: password }]);
  const cfg = await settings(sb);
  await sb.from('outreach_settings').update({ crm_agency_id: agency, crm_login: maskEmail(email),
    // старые брифы не переносим: только последние две недели и всё новое
    crm_since: cfg.crm_since ?? new Date(Date.now() - 14 * 864e5).toISOString() }).eq('id', 'main');
  return { ok: true, ...(await status(sb)), imported: (await sync(sb)).imported };
}

async function status(sb: Sb) {
  const cfg = await settings(sb);
  if (!cfg.crm_agency_id) return { ok: true, connected: false };
  let custom: { id: string; label: string }[] = [], counts = { total: 0, fresh: 0 }, error = '';
  try {
    const { crm, agency } = await session(sb);
    const [{ data: st }, { data: subs }] = await Promise.all([
      crm.from('agency_state').select('state_json').eq('id', agency).maybeSingle(),
      crm.from('brief_submissions').select('id,status').eq('agency_id', agency)
    ]);
    custom = (st?.state_json?.customBriefTypes ?? []).map((t: any) => ({ id: String(t.id), label: String(t.label) }));
    counts = { total: subs?.length ?? 0, fresh: (subs ?? []).filter((s: any) => s.status !== 'converted').length };
  } catch (e) { error = e instanceof Error ? e.message : 'нет связи с CRM'; }
  const types = [...CRM_TYPES, ...custom.filter(t => !CRM_TYPES.some(x => x.id === t.id))];
  return {
    ok: true, connected: true, login: cfg.crm_login, agency: cfg.crm_agency_id, lastSync: cfg.crm_last_sync, error, counts,
    links: types.map(t => ({ ...t, url: briefLink(cfg.crm_agency_id, t.id) })),
    adervisTemplates: ADERVIS_TEMPLATES.map(t => ({ id: t.id, label: t.label, installed: custom.some(c => c.id === t.id) }))
  };
}

// Новые брифы CRM → заявка в воронке и бриф на разбор; уведомление в Telegram.
async function sync(sb: Sb) {
  const cfg = await settings(sb);
  if (!cfg.crm_agency_id) return { ok: true, imported: 0, skipped: 'CRM не подключена' };
  const { crm, agency } = await session(sb);
  const { data: subs, error } = await crm.from('brief_submissions').select('*').eq('agency_id', agency).gt('submitted_at', cfg.crm_since || new Date(Date.now() - 14 * 864e5).toISOString())
    .order('submitted_at', { ascending: false }).limit(200);
  if (error) throw new Error('CRM не отдала брифы: ' + error.message);
  const ids = (subs ?? []).map((s: any) => String(s.id));
  const { data: have } = ids.length ? await sb.from('briefs').select('crm_id').in('crm_id', ids) : { data: [] };
  const known = new Set((have ?? []).map((b: any) => b.crm_id));
  const today = permToday();
  let imported = 0;
  for (const s of (subs ?? []).filter((x: any) => !known.has(String(x.id)))) {
    const { lead, brief } = fromSubmission(s, today);
    const { error: le } = await sb.from('leads').upsert(lead, { onConflict: 'id', ignoreDuplicates: true });
    if (le) { console.error('crm lead:', le.message); continue; }
    const { error: be } = await sb.from('briefs').insert(brief);
    if (be) { console.error('crm brief:', be.message); continue; }
    imported++;
    await notify(sb, `📋 Новый бриф из CRM: ${brief.title}\n${lead.note}\nОткрыть: «Брифы и КП» в Hub ADERVIS`);
  }
  await sb.from('outreach_settings').update({ crm_last_sync: new Date().toISOString() }).eq('id', 'main');
  return { ok: true, imported, total: subs?.length ?? 0 };
}

async function notify(sb: Sb, text: string) {
  if (!INTEL_TOKEN) return;
  const { data: subs } = await sb.from('digest_subscribers').select('chat_id');
  for (const s of subs ?? []) await sendDigest(Number(s.chat_id), text);
}

// Состояние CRM меняем «прочитал — изменил — записал, если никто не успел
// сохранить между делом»: запись идёт с условием на прежнюю метку версии.
// После записи будим открытые вкладки CRM тем же сигналом, каким CRM будит
// их сама после сохранения, — они перечитывают облако и не затирают нового.
// deno-lint-ignore no-explicit-any
async function changeCrm(sb: Sb, change: (state: any) => any) {
  const { crm, agency, token } = await session(sb);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error } = await crm.from('agency_state').select('state_json,updated_at').eq('id', agency).maybeSingle();
    if (error || !row) throw new Error('Не удалось прочитать данные CRM');
    const result = change(row.state_json || {});
    const { data: saved, error: we } = await crm.from('agency_state')
      .update({ state_json: result.state, updated_at: new Date().toISOString() }).eq('id', agency).eq('updated_at', row.updated_at).select('id');
    if (we) throw new Error('CRM не сохранила изменения: ' + we.message);
    if (saved?.length) { await wakeCrmTabs(agency, token); return result; }
    await new Promise(r => setTimeout(r, 700));
  }
  throw new Error('CRM сейчас сохраняет изменения — попробуйте ещё раз через минуту');
}

async function wakeCrmTabs(agency: string, token: string) {
  try {
    await fetch(`${CRM_URL}/realtime/v1/api/broadcast`, {
      method: 'POST', headers: { apikey: CRM_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: `adervis-crm-${agency}`, event: 'state-sync', payload: { sender: 'ADERVIS Intelligence' } }] })
    });
  } catch (e) { console.error('crm wake:', e); }
}

// Шаблоны брифов ADERVIS — в CRM, рядом со встроенными; меняем только свои типы.
async function templates(sb: Sb) {
  const { state } = await changeCrm(sb, st => ({ state: withTemplates(st) }));
  return { ok: true, installed: ADERVIS_TEMPLATES.filter(t => state.customBriefTypes.some((c: any) => c.id === t.id)).map(t => t.label) };
}

// Бриф со сметой → клиент и сделка в CRM; повторная отправка обновляет ту же сделку.
const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
async function push(sb: Sb, raw: unknown) {
  const p = sanitizePush(raw);
  const { data: brief } = await sb.from('briefs').select('id,crm_deal_id').eq('id', p.briefId).maybeSingle();
  if (!brief) throw new Error('Бриф не найден');
  const now = new Date().toISOString();
  const r = await changeCrm(sb, st => withDeal(st, p, { deal: uid('proj'), client: uid('client') }, now, brief.crm_deal_id || ''));
  await sb.from('briefs').update({ crm_deal_id: r.dealId, crm_pushed_at: now }).eq('id', p.briefId);
  return { ok: true, dealId: r.dealId, mode: r.mode, clientCreated: r.clientCreated, lines: p.lines.length, total: p.total };
}
