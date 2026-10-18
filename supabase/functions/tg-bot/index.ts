// Telegram-бот продаж (перенесён из ADERVIS OTR). Принимает обновления от
// Telegram — без входа пользователя, поэтому каждое обновление проверяется
// секретом, который Telegram присылает в заголовке: его задаёт функция
// channels при подключении бота. Чужой запрос без секрета не обрабатывается.
//
// Сам разговор — меню, анкета, ИИ-ответ, заявка — общий для всех каналов
// и живёт в _shared/flow.ts. Здесь только то, что есть у одного Telegram:
// разбор обновления, кнопки и привязка менеджера по коду.

import { admin, secret, settings, tgApi, tgSend, transcribe, sameSecret, botDeps, telegramChannel } from '../_shared/outreach.ts';
import { parseUpdate } from '../_shared/bot.ts';
import { handleIncoming } from '../_shared/flow.ts';

const AI_ACTOR = 'telegram-bot';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const sb = admin();
  const expected = await secret(sb, 'tg_webhook_secret');
  if (!sameSecret(req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '', expected)) {
    return new Response('forbidden', { status: 401 });
  }
  const ev = parseUpdate(await req.json().catch(() => null));
  if (ev.type === 'skip') return new Response('ok');

  const tok = await secret(sb, 'tg_bot_token');
  if (!tok) return new Response('not configured', { status: 200 });
  const cfg = await settings(sb);

  try {
    if (ev.type === 'button') tgApi(tok, 'answerCallbackQuery', { callback_query_id: ev.callbackId }).catch(() => {});

    // Привязка менеджера: код из приложения → сюда будут приходить заявки.
    // Код приходит командой «/link 123456» или по ссылке из приложения: «/start link_123456».
    const link = ev.type === 'text' && (/^\/link\s+(\d{6})$/.exec(ev.text) || /^\/start\s+link_(\d{6})$/.exec(ev.text));
    if (link) {
      const ok = cfg.link_code && cfg.link_code === link[1] && cfg.link_code_expires && Date.parse(cfg.link_code_expires) > Date.now();
      if (ok) {
        await sb.from('outreach_settings').update({ manager_chat_id: ev.chatId, link_code: '', link_code_expires: null }).eq('id', 'main');
        await tgSend(tok, ev.chatId, '✅ Уведомления подключены: сюда будут приходить новые заявки и просьбы связаться с менеджером.');
      } else {
        await tgSend(tok, ev.chatId, 'Код не подошёл или устарел. Возьмите новый в приложении: «Диалоги» → «Каналы».');
      }
      return new Response('ok');
    }

    await handleIncoming(botDeps(sb, AI_ACTOR, cfg, tok), telegramChannel(tok), cfg, {
      id: ev.chatId,
      kind: ev.type,
      text: ev.type === 'text' ? ev.text : undefined,
      data: ev.type === 'button' ? ev.data : undefined,
      name: ev.name,
      link: ev.username ? `https://t.me/${ev.username}` : '',
      messageId: ev.type === 'button' ? undefined : String(ev.messageId),
      attachment: ev.type === 'text' && !!ev.attachment,
      transcribe: ev.type === 'voice' ? () => transcribe(tok, ev.fileId) : undefined
    });
  } catch (e) {
    console.error('tg-bot:', e);
  }
  // Telegram повторяет обновление, пока не получит 200, — отвечаем всегда.
  return new Response('ok');
});
