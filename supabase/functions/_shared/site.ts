// Сайт adervis.ru и Hub: заявка с формы сайта → лид в воронке, проверка
// страниц сайта (заголовок, описание, H1, картинка для соцсетей). Без сети и
// базы — проверяется тестами.

// Формы сайта шлют текст строками «Имя: …», «Контакт: …», ниже — «Страница:»,
// «UTM · …», «Переход с:», «Смотрел кейс:» (js/app.js сайта, leadSourceText).
export function siteLeadOf(text: string) {
  const t = String(text ?? '').replace(/\r/g, '').trim().slice(0, 4000);
  const line = (k: string) => (t.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1] || '').trim().slice(0, 200);
  const name = line('Имя'), contact = line('Контакт');
  if (!contact || t.length < 10) return null;
  const head = t.split('\n').map(s => s.trim()).find(Boolean) || '';
  const body = t.split('\n').filter(s => !/^(Имя|Контакт|Страница|Переход с|Смотрел кейс):/.test(s) && !/^UTM ·/.test(s) && !/^[—-]{3}$/.test(s.trim()) && s.trim() !== head)
    .join(' ').replace(/\s+/g, ' ').trim();
  return {
    name: [name || 'Без имени', contact].join(', ').slice(0, 200),
    request: (body || head).slice(0, 1000),
    page: line('Страница'), utm: (t.match(/^UTM · (.+)$/m)?.[1] || '').slice(0, 300),
    referrer: line('Переход с'), lastCase: line('Смотрел кейс'), text: t
  };
}

// Короткий отпечаток текста: одна и та же заявка дважды не заводится.
export function fingerprint(s: string): string {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const meta = (html: string, attr: string, name: string) => {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (new RegExp(`${attr}=["']${name}["']`, 'i').test(tag)) return decode(tag.match(/content=["']([^"']*)["']/i)?.[1] || '');
  }
  return '';
};

// Что видят поисковик и соцсеть на странице, и что с этим не так.
export function pageCheck(url: string, status: number, html: string) {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const description = meta(html, 'name', 'description');
  const ogImage = meta(html, 'property', 'og:image');
  const h1 = (html.match(/<h1\b/gi) || []).length;
  const problems: string[] = [];
  if (status !== 200) problems.push(`страница отвечает ${status || 'ошибкой'}`);
  else {
    if (!title) problems.push('нет заголовка (title)');
    else if (title.length > 70) problems.push(`заголовок длинный: ${title.length} знаков, в поиске обрежется`);
    if (!description) problems.push('нет описания для поиска');
    else if (description.length < 70) problems.push(`описание короткое: ${description.length} знаков`);
    else if (description.length > 170) problems.push(`описание длинное: ${description.length} знаков`);
    if (h1 === 0) problems.push('нет заголовка H1');
    if (h1 > 1) problems.push(`заголовков H1: ${h1}, нужен один`);
    if (!ogImage) problems.push('нет картинки для соцсетей (og:image)');
  }
  return { url, status, title, description, h1, ogImage, problems };
}

// Адреса из sitemap.xml.
export const sitemapUrls = (xml: string) => [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);

// Кейс сайта: /cases/<слаг>/ — сверяем с кейсами в базе знаний Hub по адресу.
export const caseSlug = (url: string) => (String(url).match(/\/cases\/([^/?#]+)\/?$/) || [])[1] || '';
