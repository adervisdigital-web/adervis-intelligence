// Рекламные кабинеты → Hub: разбор ответов VK Рекламы и Яндекс Директа в
// строки «кампания × день» и расход связанной кампании Hub. Без сети и базы —
// проверяется тестами.

// deno-lint-ignore no-explicit-any
type Row = any;
export type StatRow = { network: 'vk' | 'direct'; ext_id: string; day: string; name: string; spent: number; impressions: number; clicks: number };

const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Яндекс Директ, отчёт CAMPAIGN_PERFORMANCE_REPORT в TSV без заголовка отчёта
// и итогов: первая строка — названия полей, деньги в рублях (returnMoneyInMicros: false).
export function parseDirectTsv(tsv: string): StatRow[] {
  const lines = String(tsv || '').replace(/\r/g, '').split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const head = lines[0].split('\t');
  const at = (k: string) => head.indexOf(k);
  const [d, id, nm, im, cl, co] = ['Date', 'CampaignId', 'CampaignName', 'Impressions', 'Clicks', 'Cost'].map(at);
  if ([d, id, co].some(i => i < 0)) return [];
  return lines.slice(1).map(l => l.split('\t')).filter(c => isDay(c[d]) && c[id])
    .map(c => ({ network: 'direct' as const, ext_id: String(c[id]).slice(0, 40), day: c[d], name: (c[nm] || '').slice(0, 300),
      spent: Math.round(num(c[co]) * 100) / 100, impressions: Math.round(num(c[im])), clicks: Math.round(num(c[cl])) }));
}

export function directReportBody(from: string, to: string) {
  return { params: {
    SelectionCriteria: { DateFrom: from, DateTo: to },
    FieldNames: ['Date', 'CampaignId', 'CampaignName', 'Impressions', 'Clicks', 'Cost'],
    ReportName: `hub-${from}-${to}-${Date.now()}`, ReportType: 'CAMPAIGN_PERFORMANCE_REPORT',
    DateRangeType: 'CUSTOM_DATE', Format: 'TSV', IncludeVAT: 'YES', IncludeDiscount: 'NO'
  } };
}

// VK Реклама (ads.vk.com, API v2): кампании — ad_plans, статистика по дням —
// statistics/ad_plans/day.json: items[{ id, rows: [{ date, base: { shows, clicks, spent } }] }].
export function parseVkStats(json: Row, names: Record<string, string> = {}): StatRow[] {
  const items: Row[] = Array.isArray(json?.items) ? json.items : [];
  return items.flatMap(it => (Array.isArray(it?.rows) ? it.rows : []).filter((r: Row) => isDay(String(r?.date)))
    .map((r: Row) => ({ network: 'vk' as const, ext_id: String(it.id).slice(0, 40), day: String(r.date), name: (names[String(it.id)] || '').slice(0, 300),
      spent: Math.round(num(r.base?.spent) * 100) / 100, impressions: Math.round(num(r.base?.shows)), clicks: Math.round(num(r.base?.clicks)) })))
    .filter(r => r.spent || r.impressions || r.clicks);
}

// Расход кампании Hub — сумма по связанной кампании кабинета за её даты
// (без дат — за всё, что выгружено).
export function linkedSpent(stats: StatRow[], c: { ext_network?: string | null; ext_id?: string | null; starts_on?: string | null; ends_on?: string | null }) {
  if (!c.ext_network || !c.ext_id) return null;
  const rows = stats.filter(s => s.network === c.ext_network && s.ext_id === c.ext_id
    && (!c.starts_on || s.day >= c.starts_on) && (!c.ends_on || s.day <= c.ends_on));
  return Math.round(rows.reduce((n, s) => n + s.spent, 0));
}

export const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
