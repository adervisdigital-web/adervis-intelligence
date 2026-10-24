// Служебный бот @adervis_intel_bot — для руководителей, не для клиентов.
// Подписка на утреннюю сводку по ссылке с кодом из приложения, /today —
// сводка сейчас, /stop — отписаться. Приём заявок: перешлите боту ТЗ,
// голосовые, PDF и текст клиента, нажмите «Разобрать» — бот заведёт заявку
// и бриф с разбором и сметой. Обновления от Telegram проверяются секретом
// в заголовке: его задаёт функция channels при подключении бота.

import { admin, secret, settings, sameSecret, tgApi, permToday, type Sb } from '../_shared/outreach.ts';
import { buildDigest, sendDigest, INTEL_TOKEN, APP_URL } from '../_shared/digest-run.ts';
import { GO, CANCEL, KEYBOARD, NO_KEYBOARD, senderOf, pieceOf, docxText, compileSource, guessTitle, guessClient, applyBrief, estimateRange, summaryText, type Item } from '../_shared/intake.ts';
import { analyzeBrief, readWithAi, askModel } from '../_shared/brief-ai.ts';
import { digestVoice, clientVoice, sendAudio, voiceReady } from '../_shared/voice.ts';
import { ANSWERS, PICK, WHO, WHO_PICK, guessBrief, briefKeyboard, pickBrief, buildAnswersPrompt, parseAnswers, applyAnswers, answersText } from '../_shared/answers.ts';

const HELP = 'Перешлите сюда ТЗ, голосовые, PDF, скриншоты переписки и сообщения клиента — я соберу их в бриф с разбором и сметой. Когда всё прислали — «🧠 Разобрать».\n' +
  'Клиент ответил на вопросы? Перешлите ответ и нажмите «📝 Ответы к брифу» — разложу ответы по вопросам брифа.\n' +
  'Забыли, что за клиент? «🔊 Кто это?» — пришлю короткое голосовое.\n\n' +
  'Команды:\n/today — сводка «На сегодня» сейчас, текстом и голосом\n/new — начать новую заявку\n/stop — не присылать утреннюю сводку';

// Тяжёлую работу (скачать, расшифровать, разобрать) делаем после ответа
// Telegram: иначе он посчитает запрос зависшим и пришлёт его повторно.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const later = (p: Promise<unknown>) => { const safe = p.catch(e => console.error('intel-bot:', e)); if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(safe); else return safe; };

const send = (chat: number, text: string, markup?: unknown) =>
  tgApi(INTEL_TOKEN, 'sendMessage', { chat_id: chat, text, link_preview_options: { is_disabled: true }, ...(markup ? { reply_markup: markup } : {}) });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const sb = admin();
  if (!sameSecret(req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '', await secret(sb, 'intel_webhook_secret'))) {
    return new Response('forbidden', { status: 401 });
  }
  const msg = (await req.json().catch(() => null))?.message;
  if (!msg || msg.chat?.type !== 'private' || !INTEL_TOKEN) return new Response('ok');
  const chat = Number(msg.chat.id), text = typeof msg.text === 'string' ? msg.text.trim() : '';
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
      // Чужим — ни сводки, ни приёма заявок: в бриф попадает только то, что прислали руководители.
      await reply('Это служебный бот Hub ADERVIS. Подключить утреннюю сводку: в приложении «Настройки» → «Утренняя сводка».');
    } else if (/^\/today/.test(text)) {
      const digest = await buildDigest(sb);
      await reply(digest);
      // голос готовится полминуты — отвечаем Telegram сразу, голосовое приходит следом
      if (voiceReady()) later(digestVoice(sb, digest).then(v => sendAudio(INTEL_TOKEN, chat, v.audio, 'Сводка на сегодня')));
    } else if (/^\/stop/.test(text)) {
      await sb.from('digest_subscribers').delete().eq('chat_id', chat);
      await reply('Хорошо, утреннюю сводку больше не присылаю. Вернуть — новой ссылкой из приложения.');
    } else if (text === CANCEL || /^\/new/.test(text)) {
      await sb.from('bot_intake_items').delete().eq('chat_id', chat);
      await send(chat, text === CANCEL ? 'Заявку очистил.' : 'Начинаем новую заявку — пересылайте материалы.', text === CANCEL ? NO_KEYBOARD : undefined);
    } else if (text === WHO || /^\/who/.test(text)) {
      const { briefs } = await activeBriefs(sb);
      if (!briefs.length) { await reply('Брифов в работе нет.'); return new Response('ok'); }
      await send(chat, 'Про какого клиента рассказать?', briefKeyboard(briefs, null, CANCEL, WHO_PICK));
    } else if (text.startsWith(WHO_PICK)) {
      const brief = pickBrief(text, (await activeBriefs(sb)).briefs, WHO_PICK);
      if (!brief) { await send(chat, 'Не нашёл такой бриф в работе. Нажмите «🔊 Кто это?» ещё раз.', KEYBOARD); return new Response('ok'); }
      if (!voiceReady()) { await send(chat, 'Голос не подключён: нет ключа Gemini.', KEYBOARD); return new Response('ok'); }
      await send(chat, `Записываю голосовое про «${brief.title}», полминуты…`, KEYBOARD);
      later(clientVoice(sb, brief.id)
        .then(v => sendAudio(INTEL_TOKEN, chat, v.audio, `Кто это: ${brief.client || brief.title}`, v.text))
        .catch(e => send(chat, `Голосовое не получилось: ${e instanceof Error ? e.message : 'ошибка'}`, KEYBOARD)));
    } else if (text === ANSWERS) {
      const { count } = await sb.from('bot_intake_items').select('*', { count: 'exact', head: true }).eq('chat_id', chat);
      if (!count) { await reply('Сначала перешлите ответ клиента: сообщения, скриншоты или голосовое. Потом нажмите «📝 Ответы к брифу».'); return new Response('ok'); }
      const { briefs, leads } = await activeBriefs(sb);
      if (!briefs.length) { await reply('Брифов в работе нет. Новая заявка — кнопка «🧠 Разобрать».'); return new Response('ok'); }
      const { data: items } = await sb.from('bot_intake_items').select('sender').eq('chat_id', chat);
      const guess = guessBrief((items ?? []).map((i: any) => i.sender).find(Boolean) || '', briefs, leads);
      await send(chat, guess ? `Похоже, это ответ по брифу «${guess.title}». Выберите бриф:` : 'К какому брифу это ответ? Выберите:', briefKeyboard(briefs, guess, CANCEL));
    } else if (text.startsWith(PICK)) {
      const brief = pickBrief(text, (await activeBriefs(sb)).briefs);
      if (!brief) { await send(chat, 'Не нашёл такой бриф в работе. Нажмите «📝 Ответы к брифу» ещё раз.', KEYBOARD); return new Response('ok'); }
      await send(chat, `Раскладываю ответы по вопросам брифа «${brief.title}»…`, NO_KEYBOARD);
      await later(processAnswers(sb, chat, brief.id));
    } else if (text === GO || /^\/go/.test(text)) {
      const { count } = await sb.from('bot_intake_items').select('*', { count: 'exact', head: true }).eq('chat_id', chat);
      if (!count) { await reply('Пока ничего не прислали. Перешлите ТЗ, голосовые или сообщения клиента.'); return new Response('ok'); }
      await send(chat, `Разбираю ${count} ${count === 1 ? 'материал' : count < 5 ? 'материала' : 'материалов'} — до двух минут…`, NO_KEYBOARD);
      await later(processIntake(sb, chat));
    } else if (/^\/(start|help)/.test(text)) {
      await reply(HELP);
    } else {
      await later(collect(sb, chat, msg));
    }
  } catch (e) {
    console.error('intel-bot:', e);
  }
  return new Response('ok');
});

// Кусок заявки: скачиваем, читаем, кладём в копилку чата.
// deno-lint-ignore no-explicit-any
async function collect(sb: Sb, chat: number, msg: any) {
  const piece = pieceOf(msg);
  if (!piece) return;
  let text = piece.text || '', note = '';
  try {
    if (piece.fileId && ['docx', 'plain', 'audio', 'pdf', 'photo'].includes(piece.kind)) {
      if ((piece.size || 0) > 20_000_000) throw new Error('файл больше 20 МБ — Telegram не отдаёт такие ботам');
      const bytes = await download(piece.fileId);
      const read = piece.kind === 'docx' ? await docxText(bytes) : piece.kind === 'plain' ? new TextDecoder().decode(bytes) : await readWithAi(bytes, piece.mime || 'application/octet-stream');
      text = [read.trim(), text ? `Подпись: ${text}` : ''].filter(Boolean).join('\n\n');
    } else if (piece.kind === 'photo' || piece.kind === 'video' || piece.kind === 'other') {   // фото без файла
      note = piece.kind === 'other' ? ' — этот формат не читаю, сохранил только подпись' : ' — содержимое не читаю, сохранил подпись';
      text = text || `(${piece.name} без подписи)`;
    }
  } catch (e) {
    await send(chat, `⚠️ ${piece.name}: ${e instanceof Error ? e.message : 'не прочитался'}. Остальное продолжаю собирать.`, KEYBOARD);
    return;
  }
  const { error } = await sb.from('bot_intake_items').upsert({ chat_id: chat, msg_id: Number(msg.message_id), kind: piece.kind, name: piece.name.slice(0, 200),
    text: text.slice(0, 60000), sender: senderOf(msg) }, { onConflict: 'chat_id,msg_id', ignoreDuplicates: true });
  if (error) { console.error('intel-bot intake:', error.message); return; }
  const { count } = await sb.from('bot_intake_items').select('*', { count: 'exact', head: true }).eq('chat_id', chat);
  await send(chat, `📎 ${piece.kind === 'audio' ? '🎙 ' : ''}${piece.name}${text ? ` — ${text.length.toLocaleString('ru-RU')} знаков` : ''}${note}. В заявке: ${count}.`, KEYBOARD);
}

async function download(fileId: string): Promise<Uint8Array> {
  const f = await tgApi(INTEL_TOKEN, 'getFile', { file_id: fileId });
  if (!f?.ok || !f.result?.file_path) throw new Error('Telegram не отдал файл');
  const r = await fetch(`https://api.telegram.org/file/bot${INTEL_TOKEN}/${f.result.file_path}`, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error('файл не скачался');
  return new Uint8Array(await r.arrayBuffer());
}

const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

// «Разобрать»: заявка в воронке, бриф с ТЗ, разбор моделью, ответ со ссылкой.
async function processIntake(sb: Sb, chat: number) {
  const { data: rows } = await sb.from('bot_intake_items').select('*').eq('chat_id', chat).order('msg_id');
  const items: Item[] = (rows ?? []).map((r: any) => ({ kind: r.kind, name: r.name, text: r.text, sender: r.sender }));
  if (!items.length) return;
  const today = permToday(), title = guessTitle(items), client = guessClient(items), source = compileSource(items);
  const leadId = 'tg-' + uid(), briefId = 'tg-' + uid();
  const { error: le } = await sb.from('leads').insert({ id: leadId, came_on: today, name: (client ? `${client} — ${title}` : title).slice(0, 200), source: 'Не знаем',
    direction: 'Студия', request: title.slice(0, 1000), amount: 0, status: 'Новое', note: 'Материалы переслали в @adervis_intel_bot — бриф в «Брифах и КП».',
    reached: 0, next_step: 'Проверить разбор и ответить клиенту', next_on: today, lost_reason: '' });
  if (le) { await send(chat, '⚠️ Не завёл заявку: ' + le.message + '. Материалы сохранены — нажмите «Разобрать» ещё раз.', KEYBOARD); return; }
  const brief: Record<string, unknown> = { id: briefId, lead_id: leadId, title, client, stage: 'Разбор', source_text: source,
    analysis: {}, questions: [], estimate: { reserve: 10, round: 5000, items: [], options: [] }, plan: [], kp: {}, next_step: 'Разобрать ТЗ', next_on: today };
  let range = null, model = '', problem = '';
  if (source.length >= 80) {
    try {
      const r = await analyzeBrief(sb, source, client);
      Object.assign(brief, applyBrief(r, today), { stage: 'Вопросы', next_step: 'Проверить разбор и отправить вопросы клиенту' });
      range = estimateRange(brief.estimate as Record<string, unknown>, r.rates);
      model = r.model;
    } catch (e) { problem = e instanceof Error ? e.message : 'разбор не получился'; }
  } else problem = 'текста мало для разбора — допишите ТЗ в приложении';
  const { error: be } = await sb.from('briefs').insert(brief);
  if (be) { await send(chat, '⚠️ Не завёл бриф: ' + be.message, KEYBOARD); return; }
  await sb.from('bot_intake_items').delete().eq('chat_id', chat);
  const link = `${APP_URL}#brief=${briefId}`;
  await send(chat, problem
    ? `🧾 Бриф заведён: ${title}\nРазбор не сделал: ${problem}. Откройте бриф и нажмите «Разобрать ТЗ с ИИ».\n\nОткрыть бриф: ${link}`
    : summaryText({ title, client, analysis: brief.analysis as Record<string, unknown>, questions: brief.questions as Record<string, unknown>[], range, link, parts: items.length, model }));
}

// Брифы в работе — для выбора, к какому брифу ответ клиента.
async function activeBriefs(sb: Sb) {
  const { data: briefs } = await sb.from('briefs').select('id,title,client,lead_id,stage,updated_at').not('stage', 'in', '("Сделка","Отказ")').order('updated_at', { ascending: false }).limit(20);
  const ids = (briefs ?? []).map((b: any) => b.lead_id).filter(Boolean);
  const { data: leads } = ids.length ? await sb.from('leads').select('id,name').in('id', ids) : { data: [] };
  return { briefs: briefs ?? [], leads: leads ?? [] };
}

// «Ответы к брифу»: модель раскладывает переписку по вопросам, бриф и заявка обновляются.
async function processAnswers(sb: Sb, chat: number, briefId: string) {
  const { data: rows } = await sb.from('bot_intake_items').select('*').eq('chat_id', chat).order('msg_id');
  const items: Item[] = (rows ?? []).map((r: any) => ({ kind: r.kind, name: r.name, text: r.text, sender: r.sender }));
  const { data: brief } = await sb.from('briefs').select('*').eq('id', briefId).maybeSingle();
  if (!items.length || !brief) { await send(chat, 'Не нашёл материалов или бриф. Перешлите ответ клиента ещё раз.', KEYBOARD); return; }
  const text = compileSource(items), today = permToday(), link = `${APP_URL}#brief=${briefId}`;
  const qs = (Array.isArray(brief.questions) ? brief.questions : []) as Record<string, unknown>[];
  let parsed = { answers: new Map<number, string>(), other: '' };
  if (qs.length) {
    try { parsed = parseAnswers(await askModel(sb, buildAnswersPrompt(qs.map(q => String(q.q ?? '')), text)), qs.length); }
    catch (e) { await send(chat, `⚠️ Не разложил ответы: ${e instanceof Error ? e.message : 'ошибка модели'}. Материалы сохранены — выберите бриф ещё раз.`, KEYBOARD); return; }
  }
  const upd = applyAnswers(brief, parsed, text, today);
  const { error } = await sb.from('briefs').update({ questions: upd.questions, source_text: upd.source_text, next_step: upd.next_step, next_on: upd.next_on }).eq('id', briefId);
  if (error) { await send(chat, '⚠️ Не записал в бриф: ' + error.message, KEYBOARD); return; }
  if (brief.lead_id) await sb.from('leads').update({ next_step: upd.next_step, next_on: today }).eq('id', brief.lead_id);
  await sb.from('bot_intake_items').delete().eq('chat_id', chat);
  await send(chat, qs.length ? answersText(String(brief.title), upd.questions, upd.got, upd.open, parsed.other, link)
    : `📝 В брифе «${brief.title}» нет вопросов — ответ клиента дописал к ТЗ.
${link}`);
}
