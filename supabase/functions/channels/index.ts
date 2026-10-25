// Каналы переписки для приложения: подключение бота, отправка сообщения
// клиенту, привязка менеджера. Только для вошедших участников — в отличие
// от OTR, где отправку мог вызвать любой, знающий номер лида.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import {
  admin, secret, settings, tgApi, tgSend, addMessage, json, CORS, SUPABASE_URL, PUBLIC_KEY, vkApi, vkChannel, VK_V, type Sb
} from '../_shared/outreach.ts';
import { buildDigest, sendDigest, INTEL_TOKEN } from '../_shared/digest-run.ts';
import { COMMANDS } from '../_shared/intake.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  try {
    const auth = req.headers.get('Authorization');
    if (!auth || !PUBLIC_KEY) return json({ error: 'Нужен вход в систему' }, 401);
    const user = createClient(SUPABASE_URL, PUBLIC_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user: me } } = await user.auth.getUser();
    if (!me) return json({ error: 'Нужен вход в систему' }, 401);
    const { data: allowed } = await user.rpc('is_member');
    if (allowed !== true) return json({ error: 'Нет доступа' }, 403);

    const body = await req.json().catch(() => ({}));
    const sb = admin();
    switch (body?.action) {
      case 'status': return json(await status(sb));
      case 'tg-connect': return json(await tgConnect(sb));
      case 'vk-connect': return json(await vkConnect(sb));
      case 'link-code': return json(await linkCode(sb));
      case 'send': return json(await send(sb, String(body.prospectId ?? ''), String(body.text ?? ''), me.email ?? ''));
      case 'read': await sb.from('prospects').update({ unread: 0 }).eq('id', String(body.prospectId ?? '')); return json({ ok: true });
      case 'mode': {
        const mode = body.mode === 'bot' ? 'bot' : 'human';
        await sb.from('prospects').update({ bot_mode: mode }).eq('id', String(body.prospectId ?? ''));
        return json({ ok: true, mode });
      }
      // клиент ушёл в личную переписку — диалог больше не «ждёт ответа»
      case 'elsewhere': {
        const where = String(body.where ?? '').trim().slice(0, 60);
        await sb.from('prospects').update({ elsewhere: where, ...(where ? { unread: 0 } : {}) }).eq('id', String(body.prospectId ?? ''));
        return json({ ok: true, where });
      }
      case 'intel-connect': return json(await intelConnect(sb));
      case 'digest-code': return json(await digestCode(sb));
      case 'digest-now': {
        const { data: subs } = await sb.from('digest_subscribers').select('chat_id');
        if (!subs?.length) throw new Error('Пока никто не подписан на сводку');
        const text = await buildDigest(sb);
        let sent = 0;
        for (const s of subs) if ((await sendDigest(Number(s.chat_id), text))?.ok) sent++;
        return json({ ok: true, sent });
      }
      default: return json({ error: 'Неизвестное действие' }, 400);
    }
  } catch (e) {
    console.error('channels:', e);
    return json({ error: e instanceof Error ? e.message : 'Неизвестная ошибка' }, 400);
  }
});

async function status(sb: Sb) {
  const { data: rows } = await sb.from('channel_secrets').select('name, updated_at');
  const has = new Set((rows ?? []).map((r: any) => r.name));
  const cfg = await settings(sb);
  let telegram: Record<string, unknown> = { token: has.has('tg_bot_token'), connected: false };
  if (has.has('tg_bot_token') && has.has('tg_webhook_secret')) {
    const info = await tgApi(await secret(sb, 'tg_bot_token'), 'getWebhookInfo', {});
    const url = String(info?.result?.url ?? '');
    telegram = {
      token: true, connected: url.endsWith('/functions/v1/tg-bot'), username: cfg.tg_bot_username || '',
      pending: info?.result?.pending_update_count ?? 0,
      lastError: info?.result?.last_error_message ?? '', lastErrorAt: info?.result?.last_error_date ?? 0
    };
  }
  let vk: Record<string, unknown> = { token: has.has('vk_token'), connected: false };
  if (has.has('vk_token') && cfg.vk_community_id) {
    const tok = await secret(sb, 'vk_token');
    const [g, list] = await Promise.all([vkGroup(tok, cfg.vk_community_id), vkServers(tok, Number(cfg.vk_community_id))]);
    const mine = list.items.find((x: any) => x.url === VK_URL);
    vk = { token: true, connected: mine?.status === 'ok', status: mine?.status ?? 'none', name: g?.name ?? '', screen: g?.screen_name ?? '',
      others: list.items.filter((x: any) => x !== mine).map((x: any) => hostOf(x.url)), error: list.error };
  }
  const { data: subs } = await sb.from('digest_subscribers').select('chat_id,name,hour').order('created_at');
  const intel = { token: !!INTEL_TOKEN, connected: has.has('intel_webhook_secret'), username: cfg.intel_bot_username || '', subscribers: subs ?? [] };
  return { ok: true, telegram, manager: !!cfg.manager_chat_id, vk, instagram: { token: has.has('ig_page_token') }, intel };
}

// --------------------------------------------------------------- ВКонтакте
// Подключение одним действием: ключ сообщества с доступом к управлению и
// сообщениям — и дальше всё настраивается само: сообщения и кнопки бота в
// сообществе, адрес для событий, его подтверждение и секрет.
const VK_URL = `${SUPABASE_URL}/functions/v1/vk-bot`;
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return String(u).slice(0, 60); } };
const vkErr = (r: any, fallback: string) => r?.error?.error_code === 15 || r?.error?.error_code === 27
  ? fallback : `${fallback} (ВКонтакте: ${r?.error?.error_msg ?? 'нет ответа'})`;

async function vkGroup(tok: string, id?: number) {
  const r = await vkApi(tok, 'groups.getById', id ? { group_id: id } : {});
  return (r?.response?.groups ?? r?.response ?? [])[0] ?? null;
}
async function vkServers(tok: string, gid: number) {
  const r = await vkApi(tok, 'groups.getCallbackServers', { group_id: gid });
  return { items: r?.response?.items ?? [], error: r?.error?.error_msg ?? '' };
}

async function vkConnect(sb: Sb) {
  const tok = await secret(sb, 'vk_token');
  if (!tok) throw new Error('Сначала вставьте ключ сообщества');
  const group = await vkGroup(tok);
  if (!group?.id) throw new Error('ВКонтакте не принял ключ — нужен ключ сообщества, а не личный');
  const gid = Number(group.id);
  const NO_MANAGE = 'У ключа нет доступа к управлению сообществом — создайте ключ заново и отметьте «Управление сообществом»';
  const conf = await vkApi(tok, 'groups.getCallbackConfirmationCode', { group_id: gid });
  if (!conf?.response?.code) throw new Error(vkErr(conf, NO_MANAGE));
  const vkSecret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  await sb.from('channel_secrets').upsert([
    { name: 'vk_confirmation', value: String(conf.response.code) }, { name: 'vk_secret', value: vkSecret }
  ]);
  await sb.from('outreach_settings').update({ vk_community_id: gid }).eq('id', 'main');
  // Кнопки бота включаются только в настройках сообщества (ключом сообщества
  // их не включить) — без них бот пишет варианты ответа текстом.

  const { items } = await vkServers(tok, gid);
  let serverId = items.find((x: any) => x.url === VK_URL)?.id;
  if (serverId) {
    const r = await vkApi(tok, 'groups.editCallbackServer', { group_id: gid, server_id: serverId, url: VK_URL, title: 'Hub ADERVIS', secret_key: vkSecret });
    if (r?.error) throw new Error(vkErr(r, NO_MANAGE));
  } else {
    const r = await vkApi(tok, 'groups.addCallbackServer', { group_id: gid, url: VK_URL, title: 'Hub ADERVIS', secret_key: vkSecret });
    serverId = r?.response?.server_id;
    if (!serverId) throw new Error(vkErr(r, NO_MANAGE));
  }
  const set = await vkApi(tok, 'groups.setCallbackSettings', { group_id: gid, server_id: serverId, api_version: VK_V, message_new: 1, message_reply: 1 });
  if (set?.error) throw new Error(vkErr(set, NO_MANAGE));
  // ВКонтакте сам проверяет адрес строкой подтверждения — ждём до десяти секунд
  let status = '';
  for (let i = 0; i < 5 && status !== 'ok' && status !== 'failed'; i++) {
    await new Promise(r => setTimeout(r, 2000));
    status = (await vkServers(tok, gid)).items.find((x: any) => x.id === serverId)?.status ?? '';
  }
  return { ok: true, name: group.name, screen: group.screen_name, status,
    others: items.filter((x: any) => x.url !== VK_URL).map((x: any) => hostOf(x.url)) };
}

// Подключение: ключ проверяется у Telegram, бот подписывается на сообщения
// с новым секретом — старые адреса и секреты перестают работать.
async function tgConnect(sb: Sb) {
  const tok = await secret(sb, 'tg_bot_token');
  if (!tok) throw new Error('Сначала вставьте ключ бота от @BotFather');
  const me = await tgApi(tok, 'getMe', {});
  if (!me?.ok) throw new Error('Telegram не принял ключ бота — проверьте, что скопировали его целиком');
  const webhookSecret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await sb.from('channel_secrets').upsert({ name: 'tg_webhook_secret', value: webhookSecret });
  const set = await tgApi(tok, 'setWebhook', {
    url: `${SUPABASE_URL}/functions/v1/tg-bot`, secret_token: webhookSecret,
    allowed_updates: ['message', 'callback_query'], drop_pending_updates: true
  });
  if (!set?.ok) throw new Error('Telegram не принял адрес бота: ' + (set?.description ?? 'без описания'));
  await tgApi(tok, 'setMyCommands', { commands: [
    { command: 'start', description: 'Начать' }, { command: 'portfolio', description: 'Примеры работ' },
    { command: 'brief', description: 'Оставить заявку' }, { command: 'manager', description: 'Написать менеджеру' }
  ] });
  await sb.from('outreach_settings').update({ tg_bot_username: me.result.username ?? '' }).eq('id', 'main');
  return { ok: true, username: me.result.username };
}

async function linkCode(sb: Sb) {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
  const expires = new Date(Date.now() + 15 * 60_000).toISOString();
  await sb.from('outreach_settings').update({ link_code: code, link_code_expires: expires }).eq('id', 'main');
  const cfg = await settings(sb);
  return { ok: true, code, expires, username: cfg.tg_bot_username || '' };
}

// Ответ клиенту из приложения. Канал — тот, откуда человек пришёл.
async function send(sb: Sb, prospectId: string, text: string, email: string) {
  text = text.trim();
  if (!text) throw new Error('Пустое сообщение');
  if (text.length > 4000) throw new Error('Сообщение длиннее 4000 знаков');
  const { data: p } = await sb.from('prospects').select('*').eq('id', prospectId).maybeSingle();
  if (!p) throw new Error('Диалог не найден');
  let channel = '', external = '';
  if (p.tg_chat_id) {
    const tok = await secret(sb, 'tg_bot_token');
    if (!tok) throw new Error('Telegram-бот не подключён');
    const r = await tgSend(tok, Number(p.tg_chat_id), text);
    if (!r?.ok) throw new Error(/blocked/i.test(r?.description ?? '') ? 'Клиент заблокировал бота' : 'Telegram не доставил: ' + (r?.description ?? ''));
    channel = 'Telegram'; external = String(r.result?.message_id ?? '');
  } else if (p.vk_peer_id) {
    const tok = await secret(sb, 'vk_token');
    if (!tok) throw new Error('ВКонтакте не подключён');
    const id = await vkChannel(tok).send(Number(p.vk_peer_id), text);
    if (id === null) throw new Error('ВКонтакте не доставил сообщение — возможно, человек запретил сообщения от сообщества');
    channel = 'ВКонтакте'; external = id;
  } else {
    throw new Error('У этого контакта нет переписки в подключённых каналах');
  }
  await addMessage(sb, { prospect_id: p.id, channel, direction: 'out', text, author: email, external_id: external });
  // Ответил человек — дальше диалог ведёт он, а не бот.
  const status = ['Найден', 'Изучили'].includes(p.status) ? 'Написали' : p.status;
  await sb.from('prospects').update({ unread: 0, bot_mode: 'human', status, attempt_count: (p.attempt_count ?? 0) + 1 }).eq('id', p.id);
  return { ok: true, channel };
}

// ------------------------------------------------- служебный бот и сводка
// @adervis_intel_bot уже есть в проекте (им функция publish пишет в канал):
// подписываем его на сообщения руководителей с новым секретом.
async function intelConnect(sb: Sb) {
  if (!INTEL_TOKEN) throw new Error('В проекте нет ключа служебного бота TELEGRAM_BOT_TOKEN');
  const me = await tgApi(INTEL_TOKEN, 'getMe', {});
  if (!me?.ok) throw new Error('Telegram не принял ключ служебного бота');
  const hook = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await sb.from('channel_secrets').upsert({ name: 'intel_webhook_secret', value: hook });
  const set = await tgApi(INTEL_TOKEN, 'setWebhook', { url: `${SUPABASE_URL}/functions/v1/intel-bot`, secret_token: hook, allowed_updates: ['message'] });
  if (!set?.ok) throw new Error('Telegram не принял адрес служебного бота: ' + (set?.description ?? ''));
  await tgApi(INTEL_TOKEN, 'setMyCommands', { commands: COMMANDS });
  await sb.from('outreach_settings').update({ intel_bot_username: me.result.username ?? '' }).eq('id', 'main');
  return { ok: true, username: me.result.username };
}

async function digestCode(sb: Sb) {
  const { data: hook } = await sb.from('channel_secrets').select('name').eq('name', 'intel_webhook_secret').maybeSingle();
  const username = hook ? (await settings(sb)).intel_bot_username : (await intelConnect(sb)).username;
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
  await sb.from('outreach_settings').update({ digest_code: code, digest_code_expires: new Date(Date.now() + 15 * 60_000).toISOString() }).eq('id', 'main');
  return { ok: true, code, username };
}
