// Разбор лент площадок в один вид: пост = площадка, номер, ссылка, дата,
// заголовок, текст, просмотры. Здесь только чистые функции — их проверяют
// тесты на настоящих образцах страниц, без сети.

export type FeedPost = {
  network: string;
  id: string;
  url: string;
  date: string;      // ISO, как отдала площадка
  title: string;
  text: string;
  views: number | null;
  replies: number | null;
};

export const FEED_NETWORKS = ['Telegram', 'YouTube', 'ВКонтакте'];
export const FEED_LIMIT = 30;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…' };

export function decodeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Разметка поста → простой текст: переносы строк сохраняем, теги убираем.
export function htmlToText(html: string): string {
  return decodeHtml(html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// «47», «1.2K», «3,4M» → число. Телеграм пишет просмотры сокращённо.
export function parseViews(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const m = String(raw).trim().replace(',', '.').match(/^([\d.]+)\s*([KkMm])?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = !m[2] ? 1 : /k/i.test(m[2]) ? 1e3 : 1e6;
  return Math.round(n * mult);
}

export const firstLine = (text: string) => (text.split('\n').find(l => l.trim()) || '').trim().slice(0, 140);

const pick = (s: string, re: RegExp) => { const m = s.match(re); return m ? m[1] : ''; };

// Публичная страница канала t.me/s/<имя>: последние ~20 постов без ключей.
export function parseTelegram(html: string, handle: string): FeedPost[] {
  const posts: FeedPost[] = [];
  for (const block of html.split('tgme_widget_message_wrap').slice(1)) {
    const ref = pick(block, /data-post="([^"]+)"/);
    if (!ref) continue;
    const id = ref.split('/').pop() || '';
    const textHtml = pick(block, /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const text = htmlToText(textHtml);
    const date = pick(block, /class="tgme_widget_message_date"[^>]*>\s*<time datetime="([^"]+)"/);
    const video = /tgme_widget_message_video/.test(block);
    posts.push({
      network: 'Telegram', id,
      url: `https://t.me/${handle}/${id}`,
      date,
      title: firstLine(text) || (video ? 'Видео без подписи' : 'Пост без текста'),
      text,
      views: parseViews(pick(block, /class="tgme_widget_message_views">([^<]+)</)),
      replies: null
    });
  }
  // Новые сверху — так же, как в остальных лентах.
  return posts.reverse();
}

// RSS канала YouTube: 15 последних роликов с просмотрами, без ключей.
export function parseYouTube(xml: string): FeedPost[] {
  return xml.split('<entry>').slice(1).map(e => {
    const id = pick(e, /<yt:videoId>([^<]+)</);
    const text = decodeHtml(pick(e, /<media:description>([\s\S]*?)<\/media:description>/)).trim();
    const views = pick(e, /<media:statistics views="(\d+)"/);
    return {
      network: 'YouTube', id,
      url: pick(e, /<link rel="alternate" href="([^"]+)"/) || `https://www.youtube.com/watch?v=${id}`,
      date: pick(e, /<published>([^<]+)</),
      title: decodeHtml(pick(e, /<title>([^<]*)</)).trim(),
      text,
      views: views ? Number(views) : null,
      replies: null
    };
  }).filter(p => p.id);
}

type VkItem = { id: number; owner_id: number; date: number; text?: string; views?: { count?: number }; comments?: { count?: number } };

// Ответ метода wall.get. Сервисный ключ VK читает открытые сообщества.
export function parseVk(payload: { response?: { items?: VkItem[] }; error?: { error_code?: number; error_msg?: string } }): FeedPost[] {
  if (payload?.error) throw new Error(vkError(payload.error));
  return (payload?.response?.items || []).map(i => {
    const text = (i.text || '').trim();
    return {
      network: 'ВКонтакте', id: String(i.id),
      url: `https://vk.com/wall${i.owner_id}_${i.id}`,
      date: new Date(i.date * 1000).toISOString(),
      title: firstLine(text) || 'Пост без текста',
      text,
      views: i.views?.count ?? null,
      replies: i.comments?.count ?? null
    };
  });
}

export function vkError(e: { error_code?: number; error_msg?: string }): string {
  if (e.error_code === 5) return 'ВКонтакте не принял ключ: проверьте секрет VK_SERVICE_TOKEN';
  if (e.error_code === 15 || e.error_code === 30) return 'Стена сообщества закрыта — парсер видит только открытые';
  if (e.error_code === 100 || e.error_code === 113) return 'Сообщество не найдено: проверьте адрес в аккаунтах площадок';
  if (e.error_code === 6 || e.error_code === 29) return 'ВКонтакте просит подождать: слишком частые запросы';
  return `ВКонтакте ответил ошибкой ${e.error_code ?? ''}: ${e.error_msg ?? 'без описания'}`.trim();
}

// Адрес в аккаунтах могут вписать как угодно: ссылкой, с @ или без.
export function cleanHandle(network: string, raw: string): string {
  let h = String(raw || '').trim();
  h = h.replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/^(t\.me\/s\/|t\.me\/|telegram\.me\/|vk\.com\/|youtube\.com\/channel\/|m\.vk\.com\/)/i, '')
    .replace(/^@/, '').replace(/[/?#].*$/, '');
  const ok = network === 'YouTube' ? /^UC[\w-]{22}$/.test(h)
    : network === 'Telegram' ? /^[A-Za-z0-9_]{4,32}$/.test(h)
    : /^[A-Za-z0-9_.]{2,64}$/.test(h);
  if (!ok) {
    throw new Error(network === 'YouTube'
      ? 'Для YouTube нужен номер канала вида UC… (22 знака после UC)'
      : `Адрес ${network} не похож на имя канала: «${raw}»`);
  }
  return h;
}

export function feedUrl(network: string, handle: string, vkToken?: string): string {
  if (network === 'Telegram') return `https://t.me/s/${handle}`;
  if (network === 'YouTube') return `https://www.youtube.com/feeds/videos.xml?channel_id=${handle}`;
  if (network === 'ВКонтакте') {
    if (!vkToken) throw new Error('Для ВКонтакте нужен сервисный ключ: добавьте секрет VK_SERVICE_TOKEN в проект');
    const q = new URLSearchParams({ domain: handle, count: String(FEED_LIMIT), access_token: vkToken, v: '5.199' });
    return `https://api.vk.com/method/wall.get?${q}`;
  }
  throw new Error(`Площадку «${network}» парсер пока не читает`);
}

export function parseFeed(network: string, body: string, handle: string): FeedPost[] {
  const posts = network === 'Telegram' ? parseTelegram(body, handle)
    : network === 'YouTube' ? parseYouTube(body)
    : parseVk(JSON.parse(body));
  return posts.slice(0, FEED_LIMIT);
}
