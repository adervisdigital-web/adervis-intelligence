// Поиск клиентов: разбор сайта компании и ответа поиска организаций.
// Только чистые функции — тесты гоняют их на образцах без сети.

export type Contacts = {
  title: string;
  description: string;
  emails: string[];
  phones: string[];
  socials: string[];
  contactsUrl: string;
};

export type Org = {
  external_id: string;
  name: string;
  address: string;
  category: string;
  website: string;
  phone: string;
  hours: string;
};

const MAX = 8;
const uniq = (list: string[]) => [...new Set(list)].slice(0, MAX);

// Адрес приходит от человека, а открывает его сервер. Пускаем только
// обычные сайты: http(s), имя домена, без логинов, IP-адресов и внутренних
// имён — иначе функцию можно навести на внутреннюю сеть.
export function checkUrl(raw: string): URL {
  let s = String(raw || '').trim();
  if (!s) throw new Error('Укажите адрес сайта');
  if (!/^[a-z]+:\/\//i.test(s)) s = 'https://' + s;
  let u: URL;
  try { u = new URL(s); } catch { throw new Error('Адрес сайта не распознан'); }
  const host = u.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Открываются только сайты: http или https');
  if (u.username || u.password) throw new Error('Адрес с логином не принимается');
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('Нестандартный порт не принимается');
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith('[') || host.includes(':')) throw new Error('Нужен адрес сайта, а не IP');
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)) throw new Error('Это не адрес публичного сайта');
  u.hash = '';
  return u;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–' };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') {
    const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(c) ? String.fromCodePoint(c) : m;
  }
  return ENT[e.toLowerCase()] ?? m;
});
const clean = (s: string) => decode(s).replace(/\s+/g, ' ').trim();

// Российский номер в одном виде: +7 (xxx) xxx-xx-xx. Остальное — как есть.
export function normalizePhone(raw: string): string {
  const d = String(raw || '').replace(/\D/g, '');
  const ru = d.length === 11 && /^[78]/.test(d) ? d.slice(1) : d.length === 10 && d[0] === '9' ? d : '';
  if (ru) return `+7 (${ru.slice(0, 3)}) ${ru.slice(3, 6)}-${ru.slice(6, 8)}-${ru.slice(8)}`;
  return d.length >= 7 && d.length <= 15 ? String(raw).trim() : '';
}

const SOCIAL = /^https?:\/\/(www\.|m\.)?(vk\.com|vk\.ru|t\.me|telegram\.me|youtube\.com|youtu\.be|rutube\.ru|dzen\.ru|ok\.ru|instagram\.com|wa\.me|behance\.net)\/[^\s"'<>]+/i;
// ссылки «поделиться», а не профиль компании
const SHARE = /\/(share|sharer|intent|widget_|away\.php)|[?&](url|u)=/i;

export function extractContacts(html: string, base: URL): Contacts {
  const hrefs = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({ href: decode(m[1]).trim(), text: clean(m[2].replace(/<[^>]+>/g, ' ')) }));
  const text = clean(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));

  const emails = uniq([
    ...hrefs.filter(h => /^mailto:/i.test(h.href)).map(h => h.href.slice(7).split('?')[0]),
    ...(text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [])
  ].map(e => decodeURIComponent(e).toLowerCase().trim())
    .filter(e => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) && !/\.(png|jpe?g|gif|svg|webp)$/.test(e) && !/(example|sentry|wixpress|domain)\./.test(e)));

  const phones = uniq([
    ...hrefs.filter(h => /^tel:/i.test(h.href)).map(h => h.href.slice(4)),
    ...(text.match(/(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g) || [])
  ].map(normalizePhone).filter(Boolean));

  // Соцсети компании живут в шапке и подвале; в середине страницы — ссылки
  // на клиентов из портфолио. Личные страницы ВК (id123) не берём вовсе.
  const pick = (list: string[]) => list
    .filter(h => SOCIAL.test(h) && !SHARE.test(h) && !/vk\.(com|ru)\/id\d+/i.test(h))
    .map(h => h.replace(/^http:/, 'https:').replace(/[?#].*$/, '').replace(/\/+$/, ''));
  const edges = [...html.matchAll(/<(header|footer)\b[\s\S]*?<\/\1>/gi)].map(m => m[0]).join(' ');
  const edgeLinks = pick([...edges.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => decode(m[1]).trim()));
  const perNet = new Map<string, string>();
  for (const h of edgeLinks.length ? edgeLinks : pick(hrefs.map(x => x.href))) {
    const net = new URL(h).hostname.replace(/^(www|m)\./, '');
    if (!perNet.has(net)) perNet.set(net, h);
  }
  const socials = [...perNet.values()].slice(0, MAX);

  const page = hrefs.find(h => /contact|kontakt|kontakty/i.test(h.href) || /^контакты$/i.test(h.text));
  let contactsUrl = '';
  if (page) {
    try {
      const u = new URL(page.href, base);
      if (u.hostname === base.hostname && u.href.split('#')[0] !== base.href.split('#')[0]) contactsUrl = u.href.split('#')[0];
    } catch { /* кривая ссылка на странице — пропускаем */ }
  }

  const meta = (name: string) => clean((html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')) || [])[1] || '');
  return {
    title: meta('og:site_name') || clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').slice(0, 200),
    description: (meta('description') || meta('og:description')).slice(0, 400),
    emails, phones, socials, contactsUrl
  };
}

export function mergeContacts(a: Contacts, b: Contacts): Contacts {
  return {
    title: a.title || b.title,
    description: a.description || b.description,
    emails: uniq([...a.emails, ...b.emails]),
    phones: uniq([...a.phones, ...b.phones]),
    socials: uniq([...a.socials, ...b.socials]),
    contactsUrl: a.contactsUrl
  };
}

// «API Поиска по организациям» Яндекса: ответ в формате GeoJSON.
type YaFeature = { properties?: { CompanyMetaData?: {
  id?: string; name?: string; address?: string; url?: string;
  Phones?: { formatted?: string }[]; Categories?: { name?: string }[]; Hours?: { text?: string };
} } };

export function parseYandexOrgs(payload: { features?: YaFeature[] }): Org[] {
  return (payload?.features || []).map(f => {
    const c = f.properties?.CompanyMetaData || {};
    return {
      external_id: String(c.id || ''),
      name: String(c.name || '').trim(),
      address: String(c.address || '').trim(),
      category: (c.Categories || []).map(x => x.name).filter(Boolean).slice(0, 3).join(', '),
      website: String(c.url || '').trim(),
      phone: (c.Phones || []).map(p => p.formatted).filter(Boolean).slice(0, 2).join(', '),
      hours: String(c.Hours?.text || '')
    };
  }).filter(o => o.name);
}

export function yandexUrl(query: string, city: string, key?: string, results = 50): string {
  if (!key) throw new Error('Для поиска организаций нужен ключ «API Поиска по организациям» Яндекса: секрет YANDEX_ORG_API_KEY');
  const text = `${String(query || '').trim()} ${String(city || '').trim()}`.trim();
  if (text.length < 3) throw new Error('Опишите, кого искать: например «кофейня Пермь»');
  const q = new URLSearchParams({ apikey: key, text, type: 'biz', lang: 'ru_RU', results: String(Math.min(50, results)) });
  return `https://search-maps.yandex.ru/v1/?${q}`;
}

export function yandexError(status: number): string {
  if (status === 403 || status === 401) return 'Яндекс не принял ключ: проверьте YANDEX_ORG_API_KEY и что он выпущен для «API Поиска по организациям»';
  if (status === 429) return 'Яндекс просит подождать: исчерпан лимит запросов';
  return `Поиск организаций ответил ${status}`;
}
