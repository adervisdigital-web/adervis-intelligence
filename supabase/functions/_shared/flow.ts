// Разговор бота с клиентом — один на все каналы. Канал (Telegram,
// ВКонтакте, Instagram) отличается только тем, как отправить сообщение и
// как узнать имя собеседника; меню, анкета, ИИ-ответ и заявка — общие.
// Сеть и ключи сюда приходят снаружи (deps), поэтому разговор проверяется
// тестами без настоящих серверов.

import {
  briefStep, briefQuestions, portfolioReply, managerNote, buildReplyPrompt, cleanReply, budgetAmount, menuWord,
  DEFAULT_WELCOME, MAIN_KB, ACTION_KB, type BotState, type Keyboard, type Fact
} from './bot.ts';

// deno-lint-ignore no-explicit-any
export type Sb = any;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export type Channel = {
  name: 'Telegram' | 'ВКонтакте' | 'Instagram';
  key: 'tg_chat_id' | 'vk_peer_id' | 'ig_user_id';
  source: string;
  // номер отправленного сообщения в канале или null, если не доставлено
  send: (id: number | string, text: string, kb?: Keyboard) => Promise<string | null>;
  profile?: (id: number | string) => Promise<{ name: string; link: string } | null>;
};

export type Deps = {
  sb: Sb;
  ai: (prompt: string) => Promise<string>;
  aiAllowed: () => Promise<boolean>;
  facts: () => Promise<Fact[]>;
  notify: (text: string) => Promise<void>;
  today: () => string;
};

export type Incoming = {
  id: number | string;
  kind: 'text' | 'voice' | 'button';
  text?: string;
  data?: string;
  name?: string;
  link?: string;
  messageId?: string;
  attachment?: boolean;
  transcribe?: () => Promise<string>;
};

export async function addMessage(sb: Sb, row: {
  prospect_id: string; channel: string; direction: 'in' | 'out'; text: string;
  author?: string; kind?: string; meta?: Row; external_id?: string;
}) {
  const { error } = await sb.from('messages').insert({
    prospect_id: row.prospect_id, channel: row.channel, direction: row.direction, text: row.text.slice(0, 8000),
    author: (row.author ?? '').slice(0, 120), kind: row.kind ?? 'text', meta: row.meta ?? {}, external_id: (row.external_id ?? '').slice(0, 120)
  });
  if (error) console.error('addMessage:', error.message);
}

export async function history(sb: Sb, prospectId: string, n = 8): Promise<{ in: boolean; text: string }[]> {
  const { data } = await sb.from('messages').select('direction,text').eq('prospect_id', prospectId)
    .order('created_at', { ascending: false }).limit(n);
  return (data ?? []).reverse().map((m: Row) => ({ in: m.direction === 'in', text: String(m.text ?? '') }));
}

const LABELS: Record<string, string> = {
  'm:portfolio': '📹 Примеры работ', 'm:brief': '📋 Оставить заявку', 'm:ask': '❓ Задать вопрос', 'm:manager': '💬 Написать менеджеру'
};
const stateOf = (p: Row): BotState => p.bot_state && Object.keys(p.bot_state).length ? p.bot_state : { mode: 'menu', aiRounds: 0 };
const setState = (sb: Sb, id: string, state: BotState) => sb.from('prospects').update({ bot_state: state }).eq('id', id);

export async function handleIncoming(d: Deps, ch: Channel, cfg: Row, ev: Incoming) {
  const p = await findOrCreate(d.sb, ch, ev);
  if (!p) return;
  // То же сообщение второй раз (ВКонтакте повторяет, если ответ задержался).
  if (ev.messageId) {
    const { count } = await d.sb.from('messages').select('*', { count: 'exact', head: true })
      .eq('prospect_id', p.id).eq('direction', 'in').eq('external_id', ev.messageId);
    if (count) return;
  }
  if (ev.kind === 'button') return onButton(d, ch, cfg, p, ev);
  return onMessage(d, ch, cfg, p, ev);
}

async function findOrCreate(sb: Sb, ch: Channel, ev: Incoming): Promise<Row | null> {
  const { data: found } = await sb.from('prospects').select('*').eq(ch.key, ev.id).maybeSingle();
  if (found) return found;
  const prof = ch.profile ? await ch.profile(ev.id).catch(() => null) : null;
  const { data: made, error } = await sb.from('prospects').insert({
    name: (prof?.name || ev.name || `${ch.name} ${ev.id}`).slice(0, 200), [ch.key]: ev.id, source: ch.source,
    status: 'Ответили', socials: (prof?.link || ev.link || '').slice(0, 1000), note: '', bot_state: { mode: 'menu', aiRounds: 0 }
  }).select().single();
  if (!error) return made;
  // два сообщения подряд от нового человека — второе найдёт первое
  const { data: again } = await sb.from('prospects').select('*').eq(ch.key, ev.id).maybeSingle();
  return again ?? null;
}

async function say(d: Deps, ch: Channel, p: Row, text: string, kb?: Keyboard, kind = 'text') {
  const ext = await ch.send(p[ch.key], text, kb);
  await addMessage(d.sb, { prospect_id: p.id, channel: ch.name, direction: 'out', text, author: kind === 'ai' ? 'ИИ' : 'бот',
    kind, external_id: ext ?? '', meta: ext === null ? { failed: true } : {} });
}

// Одно приветствие на все каналы; второй вариант — половине новых людей.
function welcome(cfg: Row, p: Row) {
  const a = cfg.tg_welcome_text || DEFAULT_WELCOME;
  return cfg.tg_ab_enabled && cfg.tg_welcome_text_b && p.ab_variant === 'B' ? cfg.tg_welcome_text_b : a;
}

async function ensureVariant(sb: Sb, cfg: Row, p: Row) {
  if (!cfg.tg_ab_enabled || !cfg.tg_welcome_text_b || p.ab_variant) return;
  p.ab_variant = Math.random() < 0.5 ? 'A' : 'B';
  await sb.from('prospects').update({ ab_variant: p.ab_variant }).eq('id', p.id);
}

async function onMessage(d: Deps, ch: Channel, cfg: Row, p: Row, ev: Incoming) {
  await ensureVariant(d.sb, cfg, p);
  let text = (ev.text ?? '').trim();
  if (ev.kind === 'voice') {
    text = ev.transcribe ? (await ev.transcribe().catch(() => '')).trim() : '';
    if (!text) {
      await addMessage(d.sb, { prospect_id: p.id, channel: ch.name, direction: 'in', text: '🎙 Голосовое сообщение', kind: 'voice', external_id: ev.messageId });
      return say(d, ch, p, 'Не получилось разобрать голосовое — напишите, пожалуйста, текстом 🙏', undefined, 'system');
    }
  }
  const state = stateOf(p);
  const inBrief = state.mode === 'brief' && state.step !== undefined;
  const { count: before } = await d.sb.from('messages').select('*', { count: 'exact', head: true })
    .eq('prospect_id', p.id).eq('direction', 'in');
  await addMessage(d.sb, { prospect_id: p.id, channel: ch.name, direction: 'in', text, author: p.name,
    kind: ev.kind === 'voice' ? 'voice' : inBrief ? 'brief_answer' : 'text', external_id: ev.messageId });

  if (text === '/start' || text === '/menu') {
    await setState(d.sb, p.id, { mode: 'menu', aiRounds: 0, brief: {} });
    return say(d, ch, p, welcome(cfg, p), MAIN_KB, 'system');
  }
  if (text === '/portfolio') { const r = portfolioReply(cfg.portfolio_text, cfg.portfolio_videos); return say(d, ch, p, r.text, r.keyboard, 'system'); }
  if (text === '/brief') return startBrief(d, ch, cfg, p);
  if (text === '/manager') return askManager(d, ch, p);

  // Менеджер ведёт диалог сам — бот молчит, только сообщает о новом сообщении.
  if (p.bot_mode === 'human') return d.notify(`💬 ${p.name} · ${ch.name}: ${text.slice(0, 300)}`);
  if (inBrief) {
    if (ev.attachment) return say(d, ch, p, 'Ответьте, пожалуйста, текстом — так анкета сохранится 🙏', undefined, 'system');
    return continueBrief(d, ch, cfg, p, state, { text });
  }

  // Пункт меню словами — как кнопка.
  const word = menuWord(text);
  if (word === 'm:portfolio') { const r = portfolioReply(cfg.portfolio_text, cfg.portfolio_videos); return say(d, ch, p, r.text, r.keyboard, 'system'); }
  if (word === 'm:brief') return startBrief(d, ch, cfg, p);
  if (word === 'm:manager') return askManager(d, ch, p);

  // Первое сообщение нового человека — сначала приветствие и меню.
  if (!before) await say(d, ch, p, welcome(cfg, p), MAIN_KB, 'system');
  // Картинку без подписи ИИ не разберёт — пусть посмотрит человек.
  if (ev.attachment) return d.notify(`📎 ${p.name} · ${ch.name}: ${text}`);

  if (cfg.ai_enabled === false || !(await d.aiAllowed())) {
    if (before) await say(d, ch, p, 'Спасибо! Передал менеджеру — он ответит в ближайшее время.', ACTION_KB, 'system');
    return d.notify(`💬 ${p.name} · ${ch.name}: ${text.slice(0, 300)}`);
  }
  const rounds = (state.aiRounds ?? 0) + 1;
  const prompt = buildReplyPrompt(await d.facts(), await history(d.sb, p.id), text, cfg.ai_extra || '');
  const reply = cleanReply(await d.ai(prompt));
  if (reply) await say(d, ch, p, reply, rounds >= 3 ? ACTION_KB : undefined, 'ai');
  else await say(d, ch, p, 'Передал ваш вопрос менеджеру — он скоро ответит 🙌', ACTION_KB, 'system');
  await setState(d.sb, p.id, { ...state, mode: 'ai', aiRounds: rounds });
}

async function onButton(d: Deps, ch: Channel, cfg: Row, p: Row, ev: Incoming) {
  const data = ev.data ?? '';
  const label = LABELS[data] ?? (data.startsWith('bf:') ? `Формат: ${data.slice(3)}` : data.startsWith('bb:') ? `Бюджет: ${data.slice(3)}` : data);
  await addMessage(d.sb, { prospect_id: p.id, channel: ch.name, direction: 'in', text: label, author: p.name,
    kind: data.startsWith('b') ? 'brief_answer' : 'button', external_id: ev.messageId });

  if (data === 'm:portfolio') { const r = portfolioReply(cfg.portfolio_text, cfg.portfolio_videos); return say(d, ch, p, r.text, r.keyboard, 'system'); }
  if (data === 'm:brief') return startBrief(d, ch, cfg, p);
  if (data === 'm:manager') return askManager(d, ch, p);
  if (data === 'm:ask') {
    await setState(d.sb, p.id, { mode: 'ai', aiRounds: 0, brief: {} });
    return say(d, ch, p, 'Конечно, спрашивайте! Расскажите о вашем бизнесе или задайте любой вопрос про видео, фото или дизайн.', undefined, 'system');
  }
  if (data.startsWith('bf:') || data.startsWith('bb:')) return continueBrief(d, ch, cfg, p, stateOf(p), { button: data });
}

async function startBrief(d: Deps, ch: Channel, cfg: Row, p: Row) {
  await setState(d.sb, p.id, { mode: 'brief', step: 0, brief: {}, aiRounds: 0 });
  return say(d, ch, p, '📋 Отлично! Короткая анкета — займёт минуту.\n\n' + briefQuestions(cfg.brief_questions)[0], undefined, 'system');
}

async function askManager(d: Deps, ch: Channel, p: Row) {
  await d.sb.from('prospects').update({ bot_mode: 'human' }).eq('id', p.id);
  await say(d, ch, p, '👨‍💼 Передаю менеджеру — он свяжется с вами в ближайшее время.', undefined, 'system');
  return d.notify(`💬 ${p.name} просит связаться с менеджером (${ch.name}).`);
}

async function continueBrief(d: Deps, ch: Channel, cfg: Row, p: Row, state: BotState, input: { text?: string; button?: string }) {
  const r = briefStep(state, input, briefQuestions(cfg.brief_questions));
  if (!r) return;
  await setState(d.sb, p.id, r.state);
  await say(d, ch, p, r.reply.text, r.reply.keyboard, 'system');
  if (!r.done) return;

  const b = r.done;
  await addMessage(d.sb, { prospect_id: p.id, channel: ch.name, direction: 'in', text: '📋 Заявка заполнена', kind: 'brief_complete', meta: { brief: b } });
  // Анкета — это заявка: она встаёт в воронку продаж с первым шагом на сегодня.
  const summary = [b.business && `Бизнес: ${b.business}`, b.format && `Формат: ${b.format}`, b.city && `Город: ${b.city}`,
    b.budget && `Бюджет: ${b.budget}`, b.contact && `Контакт: ${b.contact}`].filter(Boolean).join('\n');
  let leadId = p.lead_id;
  if (!leadId) {
    const { data: lead, error } = await d.sb.from('leads').insert({
      name: (b.name || p.name).slice(0, 200), source: ch.name, direction: 'Студия',
      request: [b.format, b.business].filter(Boolean).join(': ').slice(0, 1000), amount: budgetAmount(b.budget),
      status: 'Новое', note: summary.slice(0, 1000), reached: 0, next_step: `Связаться по анкете из ${ch.name}`,
      next_on: d.today()
    }).select('id').single();
    if (error) console.error('lead:', error.message);
    leadId = lead?.id ?? null;
  }
  await d.sb.from('prospects').update({
    status: 'Заявка', lead_id: leadId, phone: (b.contact || '').slice(0, 200), city: (b.city || '').slice(0, 80),
    category: (b.business || '').slice(0, 120), note: summary.slice(0, 2000), bot_mode: 'human'
  }).eq('id', p.id);
  await say(d, ch, p, '🙌 Пока ждёте — посмотрите наши работы:', { inline_keyboard: [[{ text: '📹 Примеры работ', callback_data: 'm:portfolio' }]] }, 'system');
  await d.notify(managerNote(b, p.name, ch.name));
}

// Исходящее, которое админ написал прямо во ВКонтакте или Telegram, —
// тоже часть переписки. С этого момента диалог ведёт человек.
export async function recordManual(sb: Sb, ch: Channel, id: number | string, text: string, messageId: string) {
  const { data: p } = await sb.from('prospects').select('id').eq(ch.key, id).maybeSingle();
  if (!p || !text.trim()) return;
  // своё сообщение (бот или ответ из приложения) уже записано — по номеру или тексту
  const out = () => sb.from('messages').select('*', { count: 'exact', head: true }).eq('prospect_id', p.id).eq('direction', 'out');
  if (messageId && (await out().eq('external_id', messageId)).count) return;
  if ((await out().eq('text', text.slice(0, 8000)).gte('created_at', new Date(Date.now() - 120_000).toISOString())).count) return;
  await addMessage(sb, { prospect_id: p.id, channel: ch.name, direction: 'out', text, author: `менеджер в ${ch.name}`, external_id: messageId });
  await sb.from('prospects').update({ bot_mode: 'human', unread: 0 }).eq('id', p.id);
}
