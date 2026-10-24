// Как клиент смотрел КП: страница раз в 20 секунд присылает, что успело
// произойти за визит (время, разделы, ролик, скачивание сметы), функция kp
// складывает это в kp_shares.engagement. Здесь только чистые функции.

// deno-lint-ignore no-explicit-any
type Row = any;

// Разделы — по заголовкам страницы КП; чужие строки отбрасываем.
export const KP_SECTIONS = ['Как видим оформление', 'Стиль', 'Концепции', 'Концепция и сюжет', 'Что сделаем', 'Как будем делать',
  'Стоимость', 'Этапы и сроки', 'Условия', 'Наши работы', 'Почему ADERVIS', 'Обсудим?'];
const EVENTS = ['pdf', 'xlsx', 'call'];
export const HOT_SEC = 120;          // столько читают — пора писать клиенту
const MAX_VISITS = 20;

export function sanitizeTrack(body: Row) {
  const visit = String(body?.visit ?? '');
  if (!/^[A-Za-z0-9]{8,32}$/.test(visit)) return null;
  const list = (v: unknown, allowed: string[]) => [...new Set((Array.isArray(v) ? v : []).map(String))].filter(x => allowed.includes(x));
  return {
    visit,
    sec: Math.max(0, Math.min(7200, Math.round(Number(body?.sec) || 0))),
    seen: list(body?.seen, KP_SECTIONS),
    played: body?.video?.played === true,
    ended: body?.video?.ended === true,
    events: list(body?.events, EVENTS),
    variant: body?.variant === 'base' ? 'base' : body?.variant === 'full' ? 'full' : ''
  };
}

type Track = NonNullable<ReturnType<typeof sanitizeTrack>>;

// Визит обновляем «вверх»: время не уменьшается, разделы и события копятся.
// hot — визит впервые перевалил за HOT_SEC: об этом пишем руководителям один раз.
export function mergeTrack(eng: Row, t: Track, now: string) {
  const visits: Row[] = Array.isArray(eng?.visits) ? eng.visits.map((v: Row) => ({ ...v })) : [];
  let v = visits.find(x => x.id === t.visit);
  if (!v) { v = { id: t.visit, from: now, sec: 0, seen: [], played: false, ended: false, events: [], variant: '' }; visits.push(v); }
  const before = Number(v.sec) || 0;
  v.sec = Math.max(before, t.sec);
  v.seen = [...new Set([...(v.seen || []), ...t.seen])];
  v.events = [...new Set([...(v.events || []), ...t.events])];
  v.played = !!v.played || t.played || t.ended;
  v.ended = !!v.ended || t.ended;
  if (t.variant) v.variant = t.variant;
  v.at = now;
  const hot = before < HOT_SEC && v.sec >= HOT_SEC && !v.hot;
  if (hot) v.hot = true;
  const kept = visits.slice(-MAX_VISITS);
  return { eng: { visits: kept, ...engageSummary(kept) }, hot, visit: v };
}

// Итог по всем визитам — его читают приложение и утренняя сводка.
export function engageSummary(visits: Row[]) {
  const all = Array.isArray(visits) ? visits : [];
  return {
    total_sec: all.reduce((n, v) => n + (Number(v.sec) || 0), 0),
    seen: [...new Set(all.flatMap(v => v.seen || []))],
    played: all.some(v => v.played), ended: all.some(v => v.ended),
    events: [...new Set(all.flatMap(v => v.events || []))],
    last_at: all.map(v => v.at || '').sort().at(-1) || ''
  };
}

const mins = (sec: number) => sec < 60 ? `${Math.max(1, Math.round(sec))} с` : `${Math.round(sec / 60)} мин`;

// Одной строкой: «читали 4 мин · дошли до сметы · ролик досмотрели · скачали смету».
export function engageLine(e: Row): string {
  if (!e || !(Number(e.total_sec) > 0)) return '';
  const seen: string[] = e.seen || [], ev: string[] = e.events || [];
  return [
    `читали ${mins(Number(e.total_sec))}`,
    seen.includes('Стоимость') ? 'дошли до сметы' : seen.length ? `видели ${seen.length} ${seen.length === 1 ? 'раздел' : seen.length < 5 ? 'раздела' : 'разделов'}` : '',
    e.ended ? 'ролик досмотрели' : e.played ? 'запускали ролик' : '',
    ev.includes('pdf') || ev.includes('xlsx') ? 'скачали смету' : '',
    ev.includes('call') ? 'нажали «Позвонить»' : ''
  ].filter(Boolean).join(' · ');
}
