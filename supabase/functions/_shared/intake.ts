// Приём заявки через служебного бота @adervis_intel_bot: руководитель
// пересылает боту всё, что прислал клиент (ТЗ, голосовые, текст, PDF),
// нажимает «Разобрать» — и получает бриф с разбором и сметой в «Брифах и КП».
// Здесь — чистая логика без сети и базы: проверяется тестами.

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

// Кнопки говорят, что это за материал: человек выбирает смысл, а не действие бота.
export const GO = '🆕 Это новая заявка';
export const CANCEL = '🗑 Очистить';
// старые подписи — у кого в Telegram ещё старая клавиатура
export const OLD = { go: '🧠 Разобрать', cancel: '✖ Отмена', answers: '📝 Ответы к брифу', who: '🔊 Кто это?' };
// «Ответы к брифу» — текст кнопки из answers.ts, здесь без импорта, чтобы модуль оставался чистым
export const MENU = '☰ Меню';
export const KEYBOARD = { keyboard: [[{ text: '💬 Это ответ клиента' }, { text: GO }], [{ text: '🔊 Напомни про клиента' }, { text: CANCEL }], [{ text: MENU }]], resize_keyboard: true, is_persistent: true };
// Главное меню — кнопки прямо в сообщении: нажатие приходит боту как callback и
// превращается в ту же команду, что и кнопка снизу или /команда.
export const MENU_TEXT = '🟡 ADERVIS HUB\n\nЧем помочь?\n\n📋 Сводка — дела и сроки на сегодня\n💬 Ответ клиента — разложу по вопросам брифа\n🆕 Новая заявка — заведу бриф с разбором и сметой\n📂 Брифы — кто на каком шаге\n🔊 Кто клиент — напомню голосом';
export const menuKeyboard = (hub: string) => ({ inline_keyboard: [
  [{ text: '📋 Сводка на сегодня', callback_data: 'today' }],
  [{ text: '💬 Ответ клиента', callback_data: 'answers' }, { text: '🆕 Новая заявка', callback_data: 'new' }],
  [{ text: '📂 Брифы в работе', callback_data: 'briefs' }, { text: '🔊 Кто клиент', callback_data: 'who' }],
  [{ text: '🌐 Открыть Hub', url: hub }, { text: '❓ Как пользоваться', callback_data: 'help' }]
] });
export const NO_KEYBOARD = { remove_keyboard: true };
// Меню команд бота (кнопка «Меню» в Telegram). Кнопки под строкой ввода
// появляются после первого пересланного сообщения, а меню видно сразу.
export const COMMANDS = [
  { command: 'menu', description: 'Главное меню' },
  { command: 'answers', description: 'Пересланное — это ответ клиента по брифу' },
  { command: 'new', description: 'Начать заново: очистить пересланное' },
  { command: 'go', description: 'Пересланное — это новая заявка' },
  { command: 'who', description: 'Напомнить голосом, кто клиент' },
  { command: 'help', description: 'Как пользоваться ботом' },
  { command: 'today', description: 'Сводка «На сегодня»' },
  { command: 'stop', description: 'Не присылать утреннюю сводку' }
];
export const SOURCE_LIMIT = 60000;

const AUDIO: Record<string, string> = { ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac', webm: 'audio/webm' };
const IMAGE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };

// Кто автор пересланного сообщения — так в брифе видно, где клиент, а где мы.
export function senderOf(msg: Row): string {
  const o = msg?.forward_origin;
  const name = (u: Row) => [u?.first_name, u?.last_name].filter(Boolean).join(' ');
  const s = o?.type === 'user' ? name(o.sender_user) : o?.type === 'hidden_user' ? o.sender_user_name
    : o?.type === 'chat' ? o.sender_chat?.title : o?.type === 'channel' ? o.chat?.title
    : msg?.forward_from ? name(msg.forward_from) : msg?.forward_sender_name || '';
  return String(s || '').trim().slice(0, 80);
}

// Что пришло и как это читать: файл скачиваем, голос и PDF читает модель.
export type Piece = { kind: 'text' | 'docx' | 'plain' | 'audio' | 'pdf' | 'photo' | 'video' | 'other'; name: string; fileId?: string; mime?: string; size?: number; text?: string };
export function pieceOf(msg: Row): Piece | null {
  const caption = String(msg?.caption ?? '').trim();
  if (msg?.voice) return { kind: 'audio', name: 'голосовое', fileId: msg.voice.file_id, mime: 'audio/ogg', size: msg.voice.file_size };
  if (msg?.audio) {
    const n = String(msg.audio.file_name || 'аудио.mp3');
    return { kind: 'audio', name: n, fileId: msg.audio.file_id, mime: msg.audio.mime_type || AUDIO[ext(n)] || 'audio/mpeg', size: msg.audio.file_size };
  }
  if (msg?.document) {
    const n = String(msg.document.file_name || 'файл'), e = ext(n), size = msg.document.file_size;
    if (e === 'docx') return { kind: 'docx', name: n, fileId: msg.document.file_id, size, text: caption };
    if (['txt', 'md', 'csv'].includes(e)) return { kind: 'plain', name: n, fileId: msg.document.file_id, size, text: caption };
    if (e === 'pdf') return { kind: 'pdf', name: n, fileId: msg.document.file_id, mime: 'application/pdf', size, text: caption };
    if (AUDIO[e]) return { kind: 'audio', name: n, fileId: msg.document.file_id, mime: AUDIO[e], size };
    if (IMAGE[e]) return { kind: 'photo', name: n, fileId: msg.document.file_id, mime: IMAGE[e], size, text: caption };
    return { kind: 'other', name: n, size, text: caption };
  }
  // скриншот переписки или ТЗ: берём самый крупный размер, текст с него читает ИИ
  if (msg?.photo) {
    const p = Array.isArray(msg.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1] : {};
    return { kind: 'photo', name: 'скриншот', fileId: p.file_id, mime: 'image/jpeg', size: p.file_size, text: caption };
  }
  if (msg?.video || msg?.video_note) return { kind: 'video', name: msg.video_note ? 'видеосообщение' : String(msg.video?.file_name || 'видео'), text: caption };
  if (typeof msg?.text === 'string' && msg.text.trim()) return { kind: 'text', name: 'сообщение', text: msg.text.trim() };
  return null;
}
const ext = (n: string) => (String(n).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

// Текст Word-документа без DOM: абзацы, списки, таблицы (ячейки через « | »).
export function wordXmlText(xml: string): string {
  const body = (xml.match(/<w:body[^>]*>([\s\S]*)<\/w:body>/) || [, xml])[1] as string;
  const plain = (s: string) => s.replace(/<[^>]+>/g, '');
  // таблица — строкой на ряд: ячейки через « | », абзацы внутри ячейки через « / »
  const flat = body.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, tbl => '\n' + (tbl.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [])
    .map(tr => (tr.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [])
      .map(tc => (tc.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || []).map(plain).filter(Boolean).join(' / ')).join(' | ')).join('\n') + '\n');
  const x = flat
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:p\b[^>]*>(?=(?:(?!<\/w:p>)[\s\S])*?<w:numPr>)/g, '• ')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
  return x.split('\n').map(l => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function docxText(bytes: Uint8Array): Promise<string> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('файл не похож на .docx');
  const dec = new TextDecoder();
  let p = dv.getUint32(end + 16, true);
  for (let n = dv.getUint16(end + 10, true); n > 0 && dv.getUint32(p, true) === 0x02014b50; n--) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true);
    if (dec.decode(bytes.subarray(p + 46, p + 46 + nameLen)) === 'word/document.xml') {
      const local = dv.getUint32(p + 42, true);
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const raw = bytes.slice(start, start + size);
      const xml = method === 0 ? dec.decode(raw)
        : await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      return wordXmlText(xml);
    }
    p += 46 + nameLen + extra + comment;
  }
  throw new Error('в файле нет текста документа Word');
}

// Всё присланное — одним текстом ТЗ, каждый кусок под своим именем.
export type Item = { kind: string; name: string; text: string; sender: string };
export function compileSource(items: Item[]): string {
  return items.map(i => `=== ${i.name}${i.sender ? ` (от ${i.sender})` : ''}\n${i.text}`.trim()).join('\n\n').slice(0, SOURCE_LIMIT);
}

export function guessTitle(items: Item[]): string {
  const doc = items.find(i => ['docx', 'pdf', 'plain'].includes(i.kind));
  if (doc) return doc.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const line = (items.find(i => i.kind === 'text')?.text || '').split('\n').find(l => l.trim().length > 5) || '';
  return line ? line.trim().slice(0, 80) : 'Заявка из Telegram';
}
export const guessClient = (items: Item[]) => items.find(i => i.sender)?.sender || '';

// Ответ модели → поля брифа; так же раскладывает разбор приложение.
export function applyBrief(r: Row, today: string) {
  return {
    analysis: { summary: r.summary, goal: r.goal, audience: r.audience, deliverables: r.deliverables, risks: r.risks, unknowns: r.unknowns, model: r.model, at: today },
    questions: (r.questions || []).map((q: Row) => ({ q: q.q, why: q.why, status: 'новый', answer: '' })),
    estimate: { reserve: 10, round: 5000,
      items: (r.items || []).map((it: Row) => ({ group: it.group, name: it.name, role: it.role, min: it.min, max: it.max, variant: it.base === false ? 'full' : 'both' })),
      options: (r.options || []).map((o: Row) => ({ name: o.name, why: o.why, role: o.role, min: o.min, max: o.max })) },
    plan: r.plan || []
  };
}

// Вилка полного варианта по ставкам студии — как в приложении (запас и округление вверх).
export function estimateRange(est: Row, rates: Row[]) {
  const rate = (id: string) => Number(rates.find(r => r.id === id)?.rate) || 0, k = 1 + (Number(est.reserve) || 0) / 100, step = Number(est.round) || 5000;
  const items = (est.items || []).filter((it: Row) => (it.variant || 'both') !== 'base');
  const sum = (f: string) => items.reduce((n: number, it: Row) => n + (Number(it[f]) || 0) * rate(it.role), 0) * k;
  // до рубля, потом вверх: 1,1 × 100 000 в плавающей точке — чуть больше 110 000
  const up = (v: number) => Math.ceil(Math.round(v) / step) * step;
  return { min: up(sum('min')), max: up(sum('max')), mid: up((sum('min') + sum('max')) / 2) };
}

const rub = (n: number) => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';
export function summaryText(o: { title: string; client: string; analysis?: Row; questions?: Row[]; range?: { min: number; max: number } | null; link: string; parts: number; model?: string }) {
  const qs = (o.questions || []).slice(0, 5);
  return [
    `🧾 Бриф готов: ${o.title}${o.client ? ` — ${o.client}` : ''}`,
    o.analysis?.summary ? `\n${String(o.analysis.summary).slice(0, 500)}` : '',
    o.range && o.range.max ? `\n💰 Вилка: ${rub(o.range.min)} – ${rub(o.range.max)}` : '',
    qs.length ? `\n❓ Вопросы клиенту:\n${qs.map((q, i) => `${i + 1}. ${q.q}`).join('\n')}` : '',
    `\nМатериалов: ${o.parts}${o.model ? ` · разбор: ${o.model}` : ''}`,
    `Открыть бриф: ${o.link}`
  ].filter(Boolean).join('\n');
}
