// Каналы переписки для приложения: подключение бота, отправка сообщения
// клиенту, привязка менеджера. Только для вошедших участников — в отличие
// от OTR, где отправку мог вызвать любой, знающий номер лида.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import { admin, secret, settings, tgApi, tgSend, addMessage, json, CORS, SUPABASE_URL, PUBLIC_KEY, type Sb } from '../_shared/outreach.ts';

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
      case 'link-code': return json(await linkCode(sb));
      case 'send': return json(await send(sb, String(body.prospectId ?? ''), String(body.text ?? ''), me.email ?? ''));
      case 'read': await sb.from('prospects').update({ unread: 0 }).eq('id', String(body.prospectId ?? '')); return json({ ok: true });
      case 'mode': {
        const mode = body.mode === 'bot' ? 'bot' : 'human';
        await sb.from('prospects').update({ bot_mode: mode }).eq('id', String(body.prospectId ?? ''));
        return json({ ok: true, mode });
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
  return {
    ok: true, telegram, manager: !!cfg.manager_chat_id,
    vk: { token: has.has('vk_token'), confirmation: has.has('vk_confirmation') },
    instagram: { token: has.has('ig_page_token') }
  };
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
  } else {
    throw new Error('У этого контакта нет переписки в подключённых каналах');
  }
  await addMessage(sb, { prospect_id: p.id, channel, direction: 'out', text, author: email, external_id: external });
  // Ответил человек — дальше диалог ведёт он, а не бот.
  const status = ['Найден', 'Изучили'].includes(p.status) ? 'Написали' : p.status;
  await sb.from('prospects').update({ unread: 0, bot_mode: 'human', status, attempt_count: (p.attempt_count ?? 0) + 1 }).eq('id', p.id);
  return { ok: true, channel };
}
