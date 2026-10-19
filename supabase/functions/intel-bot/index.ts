// Служебный бот @adervis_intel_bot — для руководителей, не для клиентов.
// Подписка на утреннюю сводку по ссылке с кодом из приложения, /today —
// сводка сейчас, /stop — отписаться. Обновления от Telegram проверяются
// секретом в заголовке: его задаёт функция channels при подключении бота.

import { admin, secret, settings, sameSecret } from '../_shared/outreach.ts';
import { buildDigest, sendDigest, INTEL_TOKEN } from '../_shared/digest-run.ts';

const HELP = 'Команды:\n/today — сводка «На сегодня» сейчас\n/stop — не присылать утреннюю сводку';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const sb = admin();
  if (!sameSecret(req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '', await secret(sb, 'intel_webhook_secret'))) {
    return new Response('forbidden', { status: 401 });
  }
  const msg = (await req.json().catch(() => null))?.message;
  if (!msg || msg.chat?.type !== 'private' || typeof msg.text !== 'string' || !INTEL_TOKEN) return new Response('ok');
  const chat = Number(msg.chat.id), text = msg.text.trim();
  const reply = (t: string) => sendDigest(chat, t);
  try {
    const { data: sub } = await sb.from('digest_subscribers').select('*').eq('chat_id', chat).maybeSingle();
    const link = /^\/start\s+digest_(\d{6})$/.exec(text);
    if (link) {
      const cfg = await settings(sb);
      const ok = cfg.digest_code && cfg.digest_code === link[1] && cfg.digest_code_expires && Date.parse(cfg.digest_code_expires) > Date.now();
      if (!ok) { await reply('Код не подошёл или устарел. Возьмите новый в приложении: «Настройки» → «Утренняя сводка».'); return new Response('ok'); }
      const name = String(msg.from?.first_name ?? '').slice(0, 120);
      await sb.from('digest_subscribers').upsert({ chat_id: chat, name });
      await sb.from('outreach_settings').update({ digest_code: '', digest_code_expires: null }).eq('id', 'main');
      await reply(`✅ Готово${name ? ', ' + name : ''}! Каждое утро в ${sub?.hour ?? 9}:00 по Перми пришлю «На сегодня». Время меняется в приложении.\n\n${HELP}`);
      await reply(await buildDigest(sb));
    } else if (!sub) {
      await reply('Это служебный бот ADERVIS Intelligence. Подключить утреннюю сводку: в приложении «Настройки» → «Утренняя сводка».');
    } else if (/^\/today/.test(text)) {
      await reply(await buildDigest(sb));
    } else if (/^\/stop/.test(text)) {
      await sb.from('digest_subscribers').delete().eq('chat_id', chat);
      await reply('Хорошо, утреннюю сводку больше не присылаю. Вернуть — новой ссылкой из приложения.');
    } else {
      await reply(HELP);
    }
  } catch (e) {
    console.error('intel-bot:', e);
  }
  return new Response('ok');
});
