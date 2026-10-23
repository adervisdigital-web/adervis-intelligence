// Ответы клиента к брифу через служебного бота: руководитель пересылает
// ответ клиента, нажимает «📝 Ответы к брифу», выбирает бриф — модель
// раскладывает ответы по вопросам брифа. Здесь — чистая логика без сети.

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export const ANSWERS = '📝 Ответы к брифу';
export const PICK = '↳ ';
const CUT = 48;
const label = (b: Row) => PICK + String(b.title || 'Бриф').slice(0, CUT);

// Чей это ответ: фамилия или имя отправителя в названии заявки или в клиенте брифа.
export function guessBrief(sender: string, briefs: Row[], leads: Row[]): Row | null {
  const words = String(sender || '').toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  if (!words.length) return null;
  const hay = (b: Row) => `${leads.find(l => l.id === b.lead_id)?.name || ''} ${b.client || ''} ${b.title || ''}`.toLowerCase();
  const hits = briefs.filter(b => words.some(w => hay(b).includes(w)));
  return hits.length === 1 ? hits[0] : null;
}

// Кнопки выбора брифа: угаданный — первым, дальше свежие; внизу «Отмена».
export function briefKeyboard(briefs: Row[], guess: Row | null, cancel: string) {
  const list = guess ? [guess, ...briefs.filter(b => b.id !== guess.id)] : briefs;
  return { keyboard: [...list.slice(0, 8).map(b => [{ text: label(b) }]), [{ text: cancel }]], resize_keyboard: true, one_time_keyboard: true };
}
export const pickBrief = (text: string, briefs: Row[]) => text.startsWith(PICK) ? briefs.find(b => label(b) === text) || null : null;

export function buildAnswersPrompt(questions: string[], text: string): string {
  return [
    'Студия задала клиенту вопросы по проекту. Ниже вопросы и переписка с ответом клиента (сообщений может быть несколько, часть может быть от студии).',
    'Для каждого вопроса найди ответ клиента. Пиши коротко, по-русски, словами клиента. Ничего не выдумывай: если ответа на вопрос нет, не включай его.',
    'Отдельно в «other» — что ещё важного для проекта сказал клиент не по вопросам (сроки, бюджет, пожелания), пустая строка, если ничего.',
    'Ответь только JSON без пояснений и без markdown: {"answers":[{"n":1,"answer":"..."}],"other":"..."}',
    '', 'Вопросы:', ...questions.map((q, i) => `${i + 1}. ${q}`),
    '', 'Переписка:', text.slice(0, 20000)
  ].join('\n');
}

export function parseAnswers(out: string, count: number): { answers: Map<number, string>; other: string } {
  const raw = String(out || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  let o: Row = {};
  try { o = JSON.parse(json); } catch { throw new Error('модель ответила не по формату — попробуйте ещё раз'); }
  const answers = new Map<number, string>();
  for (const a of Array.isArray(o.answers) ? o.answers : []) {
    const n = Number(a?.n), t = String(a?.answer ?? '').trim().slice(0, 1000);
    if (Number.isInteger(n) && n >= 1 && n <= count && t) answers.set(n, t);
  }
  return { answers, other: String(o.other ?? '').trim().slice(0, 1500) };
}

// Записать в бриф: ответы в вопросы, переписку — в конец ТЗ, следующий шаг.
export function applyAnswers(brief: Row, parsed: { answers: Map<number, string>; other: string }, text: string, today: string) {
  const qs: Row[] = Array.isArray(brief.questions) ? brief.questions.map((q: Row) => ({ ...q })) : [];
  const got: number[] = [];
  parsed.answers.forEach((a, n) => { const q = qs[n - 1]; if (q) { q.answer = a; q.status = 'ответ'; got.push(n); } });
  const open = qs.map((q, i) => i + 1).filter(n => qs[n - 1].status !== 'ответ');
  return {
    questions: qs,
    source_text: `${String(brief.source_text || '').trimEnd()}\n\n=== Ответ клиента (${today})\n${text}`.slice(-60000),
    next_step: open.length ? `Ответы клиента получены, осталось вопросов: ${open.length}. Проверить смету и план` : 'Все ответы получены: проверить смету и план, обновить КП',
    next_on: today, got: got.sort((a, b) => a - b), open
  };
}

export function answersText(title: string, qs: Row[], got: number[], open: number[], other: string, link: string): string {
  const lines = [`📝 Ответы записаны в бриф «${title}»: ${got.length} из ${qs.length}.`];
  for (const n of got) lines.push(`✓ ${n}. ${qs[n - 1].q}\n   ${qs[n - 1].answer}`);
  if (open.length) lines.push('', `Без ответа: ${open.join(', ')}.`);
  if (other) lines.push('', `Ещё клиент написал: ${other}`);
  lines.push('', 'Переписка дописана к ТЗ. Проверьте смету и план.', link);
  return lines.join('\n').slice(0, 4000);
}
