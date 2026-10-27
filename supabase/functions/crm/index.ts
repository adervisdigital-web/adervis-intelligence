// Связь с ADERVIS CRM.
// Из приложения (только для участников): подключить вход в CRM, статус и
// ссылки на брифы, подтянуть новые брифы, записать шаблоны брифов ADERVIS,
// отправить бриф со сметой в CRM — клиентом и сделкой.
// По расписанию (секрет расписания, как у сводки): подтянуть новые брифы.
// В CRM ходим входом самой студии — её политика доступа отдаёт только
// данные этой студии; код CRM не меняем.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import { admin, secret, settings, json, CORS, SUPABASE_URL, PUBLIC_KEY, sameSecret, permToday, type Sb } from '../_shared/outreach.ts';
import { CRM_URL, CRM_KEY, CRM_TYPES, ADERVIS_TEMPLATES, briefLink, withTemplates, fromSubmission, maskEmail, sanitizePush, withDeal, findDeal, backChanges, choiceDeal, signupAlerts } from '../_shared/crm.ts';
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
      // клиент выбрал вариант на странице КП — функция kp просит завести сделку
      if (body?.action === 'choice') return json(await pushChoice(sb, String(body.token ?? '')));
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
  const deals = await pullDeals(sb, crm, agency);
  const signups = await watchSignups(sb, crm, cfg.crm_watch ?? {}).catch(e => { console.error('crm signups:', e); return { error: String(e?.message || e) }; });
  await sb.from('outreach_settings').update({ crm_last_sync: new Date().toISOString() }).eq('id', 'main');
  return { ok: true, imported, total: subs?.length ?? 0, deals, signups };
}

// Новые студии в CRM: сразу — «новая студия», через сутки — итог первого дня,
// за сутки до конца пробного — напоминание. Список регистраций CRM отдаёт
// только владельцу; если вход в CRM не владельца — молча пропускаем.
// deno-lint-ignore no-explicit-any
async function watchSignups(sb: Sb, crm: any, watch: any) {
  const { data: users, error } = await crm.rpc('admin_get_all_users');
  if (error || !Array.isArray(users)) return { skipped: 'нет доступа к списку регистраций CRM' };
  const plan = signupAlerts(users, watch, Date.now());
  const date = (iso?: string | null) => iso ? new Date(Date.parse(iso) + 5 * 36e5).toISOString().slice(0, 10).split('-').reverse().join('.') : '';
  const src = (u: any) => u.signup_source ? `пришла: ${u.signup_source}` : 'откуда — неизвестно';
  for (const u of plan.fresh) {
    await notify(sb, `🆕 Новая студия в ADERVIS CRM: ${u.email}\n${src(u)}${u.subscription_expires_at ? `, пробный до ${date(u.subscription_expires_at)}` : ''}.\n` +
      `Напишите сегодня: предложите помочь собрать первую смету. Так больше шансов, что начнут работать.`);
  }
  const act = async (u: any) => {
    if (!u.agency_id) return null;
    const { data } = await crm.rpc('admin_get_agency_activity', { p_agency_id: String(u.agency_id) });
    return data ?? null;
  };
  const line = (a: any) => !a || a.exists === false ? 'ничего не сохранили'
    : `сделок ${a.deals_total ?? 0} (со сметой ${a.deals_with_sum ?? 0}, вместе с примером), КП отправлено ${a.portals ?? 0}${a.portals_approved ? `, согласовано ${a.portals_approved}` : ''}`;
  for (const u of plan.firstDay) {
    const a = await act(u);
    const quiet = !a || a.exists === false || !(a.portals > 0);
    await notify(sb, `📊 Первый день студии ${u.email}: ${line(a)}.` + (quiet ? `\nДо КП клиенту не дошли. Хороший момент написать и предложить настроить CRM вместе.` : `\nДошли до КП клиенту, отлично.`));
  }
  for (const u of plan.ending) {
    const a = await act(u);
    await notify(sb, `⏳ Завтра у ${u.email} заканчивается пробный период ADERVIS CRM: ${line(a)}.\nПоследний шанс поговорить до того, как уйдут: что мешает, чем помочь.`);
  }
  await sb.from('outreach_settings').update({ crm_watch: plan.watch }).eq('id', 'main');
  return { fresh: plan.fresh.length, firstDay: plan.firstDay.length, ending: plan.ending.length, known: plan.watch.seen.length };
}

// Сделки, отправленные из брифов, → обратно в Hub: стадия, сумма, оплаты.
// Состоялась сделка — бриф и заявка переходят в «Сделку», сумма заявки = сумма CRM.
// deno-lint-ignore no-explicit-any
async function pullDeals(sb: Sb, crm: any, agency: string) {
  const { data: briefs } = await sb.from('briefs').select('id,title,client,stage,lead_id,crm_deal_id,crm_status,crm_total,crm_paid')
    .not('crm_deal_id', 'is', null).neq('crm_deal_id', '');
  if (!briefs?.length) return { checked: 0, updated: 0 };
  const { data: row, error } = await crm.from('agency_state').select('state_json').eq('id', agency).maybeSingle();
  if (error || !row) { console.error('crm deals: не прочитали состояние CRM', error?.message); return { checked: briefs.length, updated: 0 }; }
  const leadIds = briefs.map(b => b.lead_id).filter(Boolean);
  const { data: leads } = leadIds.length ? await sb.from('leads').select('id,status,amount').in('id', leadIds) : { data: [] };
  const now = new Date().toISOString();
  let updated = 0;
  for (const b of briefs) {
    const deal = findDeal(row.state_json || {}, b);
    if (!deal) continue;                                                     // сделку удалили в CRM — бриф не трогаем
    const lead = (leads ?? []).find(l => l.id === b.lead_id) ?? null;
    const ch = backChanges(b, lead, deal, now);
    if (Object.keys(ch.briefPatch).length) {
      const { error: be } = await sb.from('briefs').update(ch.briefPatch).eq('id', b.id);
      if (be) { console.error('crm deals brief:', be.message); continue; }
      updated++;
    }
    if (lead && Object.keys(ch.leadPatch).length) {
      const { error: le } = await sb.from('leads').update(ch.leadPatch).eq('id', lead.id);
      if (le) console.error('crm deals lead:', le.message);
    }
    const who = b.client || b.title;
    const paid = `оплачено ${rubs(deal.paid)} из ${rubs(deal.total)}`;
    if (ch.becameWon) await notify(sb, `🤝 Сделка состоялась: ${who}\nВ CRM: ${deal.status}, ${paid}`);
    else if (ch.paidNow > 0) await notify(sb, `💰 Оплата ${rubs(ch.paidNow)}: ${who}\nВсего ${paid}`);
  }
  return { checked: briefs.length, updated };
}
const rubs = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')} ₽`;

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
  await sb.from('briefs').update({ crm_deal_id: r.dealId, crm_pushed_at: now, crm_total: p.total, crm_synced_at: now,
    ...(r.mode === 'created' ? { crm_status: p.status, crm_paid: 0 } : {}) }).eq('id', p.briefId);
  return { ok: true, dealId: r.dealId, mode: r.mode, clientCreated: r.clientCreated, lines: p.lines.length, total: p.total };
}

// Выбор клиента в КП → сделка «Согласование» в CRM, бриф — на «Переговоры».
// Смету, уже развёрнутую в CRM руками, не трогаем — только пишем об этом.
const EARLY = ['Разбор', 'Вопросы', 'Расчёт', 'КП'];
async function pushChoice(sb: Sb, token: string) {
  const cfg = await settings(sb);
  if (!cfg.crm_agency_id) return { ok: true, skipped: 'CRM не подключена' };
  const { data: row } = await sb.from('kp_shares').select('brief_id,data,choice').eq('token', token).maybeSingle();
  if (!row?.choice || row.choice.type === 'budget') return { ok: true, skipped: 'нет выбора варианта' };
  const { data: brief } = await sb.from('briefs').select('id,title,client,stage,lead_id,source_text,crm_deal_id').eq('id', row.brief_id).maybeSingle();
  if (!brief) return { ok: true, skipped: 'бриф не найден' };
  const { data: lead } = brief.lead_id ? await sb.from('leads').select('note').eq('id', brief.lead_id).maybeSingle() : { data: null };
  const who = brief.client || brief.title;
  try {
    const p = sanitizePush(choiceDeal(row.data ?? {}, row.choice, brief, `${lead?.note ?? ''}
${String(brief.source_text ?? '').slice(0, 4000)}`));
    const now = new Date().toISOString();
    const r = await changeCrm(sb, st => withDeal(st, p, { deal: uid('proj'), client: uid('client') }, now, brief.crm_deal_id || ''));
    await sb.from('briefs').update({ crm_deal_id: r.dealId, crm_pushed_at: now, crm_total: p.total, crm_synced_at: now,
      ...(r.mode === 'created' ? { crm_status: p.status, crm_paid: 0 } : {}), ...(EARLY.includes(brief.stage) ? { stage: 'Переговоры' } : {}) }).eq('id', brief.id);
    await notify(sb, `📥 ${r.mode === 'created' ? 'Сделка заведена' : 'Сделка обновлена'} в CRM: ${who}, ${rubs(p.total)} (Согласование).
Откройте её в CRM и нажмите «Развернуть смету».`);
    return { ok: true, dealId: r.dealId, mode: r.mode, total: p.total };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'ошибка';
    console.error('crm choice:', msg);
    await notify(sb, `⚠️ Выбор клиента ${who} не попал в CRM: ${msg}. Отправьте вручную из брифа кнопкой «В ADERVIS CRM».`);
    return { ok: false, error: msg };
  }
}
