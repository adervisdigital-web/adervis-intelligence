// Поиск клиентов: контакты с сайта компании и поиск организаций по запросу.
//
// Функция только читает и отдаёт найденное; в базу записывает приложение
// от имени вошедшего человека. Сайт открывается сервером, поэтому адрес
// проверяется на каждом шаге, включая переадресации.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import { checkUrl, extractContacts, mergeContacts, parseYandexOrgs, yandexError, yandexUrl } from './compose.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
const YANDEX_KEY = Deno.env.get('YANDEX_ORG_API_KEY') ?? undefined;
const PAGE_LIMIT = 1_500_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Переадресации проходим сами: каждый следующий адрес снова проверяется.
async function fetchPage(start: URL): Promise<{ url: URL; html: string }> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const resp = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (ADERVIS Intelligence)', 'Accept': 'text/html', 'Accept-Language': 'ru' }
    });
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
      url = checkUrl(new URL(resp.headers.get('location')!, url).href);
      continue;
    }
    if (!resp.ok) throw new Error(`Сайт ответил ${resp.status}`);
    if (!/html/i.test(resp.headers.get('content-type') || 'text/html')) throw new Error('По адресу не страница, а файл');
    const reader = resp.body!.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    while (size < PAGE_LIMIT) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const buf = new Uint8Array(size);
    let at = 0;
    for (const p of parts) { buf.set(p, at); at += p.length; }
    // Старые русские сайты ещё отдают windows-1251 — кодировку берём из
    // заголовка или из самой страницы.
    const head = new TextDecoder('utf-8').decode(buf.subarray(0, 4096));
    const charset = ((resp.headers.get('content-type') || '').match(/charset=([\w-]+)/i)
      || head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
    let decoder: TextDecoder;
    try { decoder = new TextDecoder(charset.toLowerCase()); } catch { decoder = new TextDecoder('utf-8'); }
    return { url, html: decoder.decode(buf) };
  }
  throw new Error('Слишком много переадресаций');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Нужен вход в систему' }, 401);
    if (!PUBLIC_KEY) return json({ error: 'Функция настроена неполностью: нет ключей проекта' }, 500);

    const supabase = createClient(SUPABASE_URL, PUBLIC_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Нужен вход в систему' }, 401);
    const { data: allowed } = await supabase.rpc('is_member');
    if (allowed !== true) return json({ error: 'Нет доступа' }, 403);

    const body = await req.json().catch(() => ({}));

    if (body?.mode === 'search') {
      const resp = await fetch(yandexUrl(body.query, body.city, YANDEX_KEY), { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) return json({ error: yandexError(resp.status) }, 502);
      return json({ ok: true, orgs: parseYandexOrgs(await resp.json()) });
    }

    if (body?.mode === 'site') {
      const first = await fetchPage(checkUrl(body.url));
      let contacts = extractContacts(first.html, first.url);
      if (contacts.contactsUrl) {
        try {
          const second = await fetchPage(checkUrl(contacts.contactsUrl));
          contacts = mergeContacts(contacts, extractContacts(second.html, second.url));
        } catch { /* страница контактов не открылась — хватит главной */ }
      }
      return json({ ok: true, url: first.url.href, contacts });
    }

    return json({ error: 'Неизвестный режим поиска' }, 400);
  } catch (e) {
    console.error('prospect:', e);
    const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
    return json({ error: /timed out|aborted/i.test(msg) ? 'Сайт не ответил за 10 секунд' : msg }, 400);
  }
});
