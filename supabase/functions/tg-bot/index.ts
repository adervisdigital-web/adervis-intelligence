// Telegram-бот продаж (перенесён из ADERVIS OTR). Принимает обновления от
// Telegram — без входа пользователя, поэтому каждое обновление проверяется
// секретом, который Telegram присылает в заголовке: его задаёт функция
// channels при подключении бота. Чужой запрос без секрета не обрабатывается.
//
// Собеседник — компания в «Поиске клиентов», каждое сообщение — строка
// messages. Заполненный бриф создаёт заявку в воронке продаж и уведомляет
// менеджера в Telegram.

import {
  admin, secret, settings, tgApi, tgSend, addMessage, history, publicFacts, aiText, botAiAllowed,
  transcribe, sameSecret, type Sb
} from '../_shared/outreach.ts';
import {
  parseUpdate, briefStep, briefQuestions, portfolioReply, managerNote, buildReplyPrompt, cleanReply,
  budgetAmount, DEFAULT_WELCOME, MAIN_KB, ACTION_KB, type BotState
} from '../_shared/bot.ts';

const CHANNEL = 'Telegram';
const AI_ACTOR = 'telegram-bot';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const sb = admin();
  const expected = await secret(sb, 'tg_webhook_secret');
  if (!sameSecret(req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '', expected)) {
    return new Response('forbidden', { status: 401 });
  }
  const upd = await req.json().catch(() => null);
  const ev = parseUpdate(upd);
  if (ev.type === 'skip') return new Response('ok');

  const tok = await secret(sb, 'tg_bot_token');
  if (!tok) return new Response('not configured', { status: 200 });
  const cfg = await settings(sb);

  try {
    if (ev.type === 'button') {
      tgApi(tok, 'answerCallbackQuery', { callback_query_id: ev.callbackId }).catch(() => {});
      await onButton(sb, tok, cfg, ev);
    } else {
      await onMessage(sb, tok, cfg, ev);
    }
  } catch (e) {
    console.error('tg-bot:', e);
  }
  // Telegram повторяет обновление, пока не получит 200, — отвечаем всегда.
  return new Response('ok');
});

async function findOrCreate(sb: Sb, chatId: number, name: string, username: string) {
  const { data: found } = await sb.from('prospects').select('*').eq('tg_chat_id', chatId).maybeSingle();
  if (found) return found as Record<string, any>;
  const { data: made, error } = await sb.from('prospects').insert({
    name, tg_chat_id: chatId, source: 'Telegram-бот', status: 'Ответили',
    socials: username ? `https://t.me/${username}` : '', note: '', bot_state: { mode: 'menu', aiRounds: 0 }
  }).select().single();
  if (error) {
    // два обновления подряд от нового человека — второй найдёт первого
    const { data: again } = await sb.from('prospects').select('*').eq('tg_chat_id', chatId).maybeSingle();
    return again as Record<string, any>;
  }
  return made as Record<string, any>;
}

const setState = (sb: Sb, id: string, state: BotState) => sb.from('prospects').update({ bot_state: state }).eq('id', id);

async function say(sb: Sb, tok: string, p: Record<string, any>, text: string, kb?: any, kind = 'text') {
  await tgSend(tok, p.tg_chat_id, text, kb);
  await addMessage(sb, { prospect_id: p.id, channel: CHANNEL, direction: 'out', text, author: kind === 'ai' ? 'ИИ' : 'бот', kind });
}

function welcome(cfg: Record<string, any>, p: Record<string, any>) {
  const a = cfg.tg_welcome_text || DEFAULT_WELCOME;
  return cfg.tg_ab_enabled && cfg.tg_welcome_text_b && p.ab_variant === 'B' ? cfg.tg_welcome_text_b : a;
}

async function ensureVariant(sb: Sb, cfg: Record<string, any>, p: Record<string, any>) {
  if (!cfg.tg_ab_enabled || !cfg.tg_welcome_text_b || p.ab_variant) return;
  p.ab_variant = Math.random() < 0.5 ? 'A' : 'B';
  await sb.from('prospects').update({ ab_variant: p.ab_variant }).eq('id', p.id);
}

async function notifyManager(tok: string, cfg: Record<string, any>, text: string) {
  if (cfg.manager_chat_id) await tgSend(tok, Number(cfg.manager_chat_id), text);
}

async function onMessage(sb: Sb, tok: string, cfg: Record<string, any>, ev: any) {
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
    return;
  }

  const p = await findOrCreate(sb, ev.chatId, ev.name, ev.username);
  if (!p) return;
  await ensureVariant(sb, cfg, p);

  let text = ev.type === 'text' ? ev.text : '';
  if (ev.type === 'voice') {
    text = await transcribe(tok, ev.fileId);
    if (!text) {
      await addMessage(sb, { prospect_id: p.id, channel: CHANNEL, direction: 'in', text: '🎙 Голосовое сообщение', kind: 'voice' });
      await say(sb, tok, p, 'Не получилось разобрать голосовое — напишите, пожалуйста, текстом 🙏', undefined, 'system');
      return;
    }
  }
  const state: BotState = p.bot_state && Object.keys(p.bot_state).length ? p.bot_state : { mode: 'menu', aiRounds: 0 };
  const inBrief = state.mode === 'brief' && state.step !== undefined;
  const { count: before } = await sb.from('messages').select('*', { count: 'exact', head: true }).eq('prospect_id', p.id).eq('direction', 'in');
  await addMessage(sb, { prospect_id: p.id, channel: CHANNEL, direction: 'in', text, author: ev.name,
    kind: ev.type === 'voice' ? 'voice' : inBrief ? 'brief_answer' : 'text', external_id: String(ev.messageId) });

  if (text === '/start' || text === '/menu') {
    await setState(sb, p.id, { mode: 'menu', aiRounds: 0, brief: {} });
    return say(sb, tok, p, welcome(cfg, p), MAIN_KB, 'system');
  }
  if (text === '/portfolio') { const r = portfolioReply(cfg.portfolio_text, cfg.portfolio_videos); return say(sb, tok, p, r.text, r.keyboard, 'system'); }
  if (text === '/brief') return startBrief(sb, tok, cfg, p);
  if (text === '/manager') return askManager(sb, tok, cfg, p);

  // Менеджер ведёт диалог сам — бот молчит, только сообщает о новом сообщении.
  if (p.bot_mode === 'human') {
    return notifyManager(tok, cfg, `💬 ${p.name}: ${text.slice(0, 300)}`);
  }
  if (inBrief) return continueBrief(sb, tok, cfg, p, state, { text });

  // Первое сообщение нового человека — сначала приветствие и меню.
  if (!before) await say(sb, tok, p, welcome(cfg, p), MAIN_KB, 'system');

  if (cfg.ai_enabled === false || !(await botAiAllowed(sb, AI_ACTOR))) {
    if (before) await say(sb, tok, p, 'Спасибо! Передал менеджеру — он ответит в ближайшее время.', ACTION_KB, 'system');
    return notifyManager(tok, cfg, `💬 ${p.name}: ${text.slice(0, 300)}`);
  }
  const rounds = (state.aiRounds ?? 0) + 1;
  const prompt = buildReplyPrompt(await publicFacts(sb), await history(sb, p.id), text, cfg.ai_extra || '');
  const reply = cleanReply(await aiText(sb, prompt, AI_ACTOR));
  if (reply) await say(sb, tok, p, reply, rounds >= 3 ? ACTION_KB : undefined, 'ai');
  else await say(sb, tok, p, 'Передал ваш вопрос менеджеру — он скоро ответит 🙌', ACTION_KB, 'system');
  await setState(sb, p.id, { ...state, mode: 'ai', aiRounds: rounds });
}

async function onButton(sb: Sb, tok: string, cfg: Record<string, any>, ev: any) {
  const p = await findOrCreate(sb, ev.chatId, ev.name, ev.username);
  if (!p) return;
  const state: BotState = p.bot_state && Object.keys(p.bot_state).length ? p.bot_state : { mode: 'menu', aiRounds: 0 };
  const labels: Record<string, string> = { 'm:portfolio': '📹 Примеры работ', 'm:brief': '📋 Оставить заявку', 'm:ask': '❓ Задать вопрос', 'm:manager': '💬 Написать менеджеру' };
  const label = labels[ev.data] ?? (ev.data.startsWith('bf:') ? `Формат: ${ev.data.slice(3)}` : ev.data.startsWith('bb:') ? `Бюджет: ${ev.data.slice(3)}` : ev.data);
  await addMessage(sb, { prospect_id: p.id, channel: CHANNEL, direction: 'in', text: label, author: ev.name, kind: ev.data.startsWith('b') ? 'brief_answer' : 'button' });

  if (ev.data === 'm:portfolio') { const r = portfolioReply(cfg.portfolio_text, cfg.portfolio_videos); return say(sb, tok, p, r.text, r.keyboard, 'system'); }
  if (ev.data === 'm:brief') return startBrief(sb, tok, cfg, p);
  if (ev.data === 'm:manager') return askManager(sb, tok, cfg, p);
  if (ev.data === 'm:ask') {
    await setState(sb, p.id, { mode: 'ai', aiRounds: 0, brief: {} });
    return say(sb, tok, p, 'Конечно, спрашивайте! Расскажите о вашем бизнесе или задайте любой вопрос про видео, фото или дизайн.', undefined, 'system');
  }
  if (ev.data.startsWith('bf:') || ev.data.startsWith('bb:')) return continueBrief(sb, tok, cfg, p, state, { button: ev.data });
}

async function startBrief(sb: Sb, tok: string, cfg: Record<string, any>, p: Record<string, any>) {
  await setState(sb, p.id, { mode: 'brief', step: 0, brief: {}, aiRounds: 0 });
  return say(sb, tok, p, '📋 Отлично! Короткая анкета — займёт минуту.\n\n' + briefQuestions(cfg.brief_questions)[0], undefined, 'system');
}

async function askManager(sb: Sb, tok: string, cfg: Record<string, any>, p: Record<string, any>) {
  await sb.from('prospects').update({ bot_mode: 'human' }).eq('id', p.id);
  await say(sb, tok, p, '👨‍💼 Передаю менеджеру — он свяжется с вами в ближайшее время.', undefined, 'system');
  return notifyManager(tok, cfg, `💬 ${p.name} просит связаться с менеджером (Telegram).`);
}

async function continueBrief(sb: Sb, tok: string, cfg: Record<string, any>, p: Record<string, any>, state: BotState, input: { text?: string; button?: string }) {
  const r = briefStep(state, input, briefQuestions(cfg.brief_questions));
  if (!r) return;
  await setState(sb, p.id, r.state);
  await say(sb, tok, p, r.reply.text, r.reply.keyboard, 'system');
  if (!r.done) return;

  const b = r.done;
  await addMessage(sb, { prospect_id: p.id, channel: CHANNEL, direction: 'in', text: '📋 Заявка заполнена', kind: 'brief_complete', meta: { brief: b } });
  // Бриф — это заявка: она встаёт в воронку продаж с первым шагом на сегодня.
  const summary = [b.business && `Бизнес: ${b.business}`, b.format && `Формат: ${b.format}`, b.city && `Город: ${b.city}`,
    b.budget && `Бюджет: ${b.budget}`, b.contact && `Контакт: ${b.contact}`].filter(Boolean).join('\n');
  let leadId = p.lead_id;
  if (!leadId) {
    const { data: lead, error } = await sb.from('leads').insert({
      name: (b.name || p.name).slice(0, 200), source: 'Telegram', direction: 'Студия',
      request: [b.format, b.business].filter(Boolean).join(': ').slice(0, 1000), amount: budgetAmount(b.budget),
      status: 'Новое', note: summary.slice(0, 1000), reached: 0, next_step: 'Связаться по брифу из Telegram',
      // «сегодня» по пермскому времени (UTC+5): ночная заявка не должна стать вчерашней
      next_on: new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10)
    }).select('id').single();
    if (error) console.error('tg-bot lead:', error.message);
    leadId = lead?.id ?? null;
  }
  await sb.from('prospects').update({
    status: 'Заявка', lead_id: leadId, phone: (b.contact || '').slice(0, 200), city: (b.city || '').slice(0, 80),
    category: (b.business || '').slice(0, 120), note: summary.slice(0, 2000), bot_mode: 'human'
  }).eq('id', p.id);
  await say(sb, tok, p, '🙌 Пока ждёте — посмотрите наши работы:', { inline_keyboard: [[{ text: '📹 Примеры работ', callback_data: 'm:portfolio' }]] }, 'system');
  await notifyManager(tok, cfg, managerNote(b, p.name, 'Telegram'));
}
