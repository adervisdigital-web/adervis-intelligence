// Бот сообщества ВКонтакте (Callback API). ВКонтакте присылает сюда каждое
// сообщение сообществу — без входа пользователя, поэтому проверяем номер
// сообщества и секрет, который задала функция channels при подключении.
// Чужой запрос без секрета не обрабатывается.
//
// Разговор — тот же, что в Telegram (_shared/flow.ts): меню, анкета,
// ИИ-ответ, заявка в воронке, уведомление менеджеру в Telegram. ВКонтакте
// ждёт ответ «ok» за несколько секунд и повторяет событие, если не дождался,
// поэтому отвечаем сразу, а разговор доводим после ответа.

import { admin, secret, settings, sameSecret, botDeps, vkChannel, transcribeUrl, type Sb } from '../_shared/outreach.ts';
import { parseVk, type VkEvent } from '../_shared/bot.ts';
import { handleIncoming, recordManual } from '../_shared/flow.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const AI_ACTOR = 'vk-bot';
const TEXT = { headers: { 'Content-Type': 'text/plain' } };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', TEXT);
  const body = await req.json().catch(() => null);
  const sb = admin();
  const cfg = await settings(sb);
  if (!body || !cfg.vk_community_id || Number(body.group_id) !== Number(cfg.vk_community_id)) {
    return new Response('unknown community', { status: 403 });
  }
  // Подтверждение адреса: ВКонтакте ждёт строку, полученную при подключении.
  if (body.type === 'confirmation') {
    const code = await secret(sb, 'vk_confirmation');
    return new Response(code || 'not configured', { status: code ? 200 : 404, ...TEXT });
  }
  if (!sameSecret(String(body.secret ?? ''), await secret(sb, 'vk_secret'))) {
    return new Response('forbidden', { status: 403 });
  }
  const ev = parseVk(body);
  const tok = ev.type === 'skip' ? '' : await secret(sb, 'vk_token');
  if (tok) {
    const job = talk(sb, cfg, tok, ev).catch(e => console.error('vk-bot:', e));
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job); else await job;
  }
  return new Response('ok', TEXT);
});

async function talk(sb: Sb, cfg: Record<string, any>, tok: string, ev: VkEvent) {
  const ch = vkChannel(tok);
  if (ev.type === 'skip') return;
  if (ev.type === 'reply') {
    // Своё исходящее сообщество тоже получает событием. Человек, ответивший
    // прямо во ВКонтакте, — это admin_author_id; ждём, пока своё запишется.
    if (!ev.manual) return;
    await new Promise(r => setTimeout(r, 2500));
    return recordManual(sb, ch, ev.peerId, ev.text, ev.messageId);
  }
  await handleIncoming(botDeps(sb, AI_ACTOR, cfg, await secret(sb, 'tg_bot_token')), ch, cfg, {
    id: ev.peerId,
    kind: ev.type,
    text: ev.type === 'text' ? ev.text : undefined,
    data: ev.type === 'button' ? ev.data : undefined,
    messageId: ev.messageId,
    attachment: ev.type === 'text' && !!ev.attachment,
    transcribe: ev.type === 'voice' ? () => transcribeUrl(ev.url) : undefined
  });
}
