// Панель «Сайт» в Hub: проверка adervis.ru по кнопке. Обходим страницы из
// sitemap.xml и смотрим, что видят поисковик и соцсеть, плюс переход на HTTPS.
// Только для вошедших участников.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import { json, CORS, SUPABASE_URL, PUBLIC_KEY } from '../_shared/outreach.ts';
import { pageCheck, sitemapUrls } from '../_shared/site.ts';

const SITE = 'https://adervis.ru';
const LIMIT = 80;

async function get(url: string, redirect: RequestRedirect = 'follow') {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect, signal: AbortSignal.timeout(12_000), headers: { 'User-Agent': 'HubADERVIS-SiteCheck/1.0' } });
    return { status: r.status, location: r.headers.get('location') || '', text: redirect === 'follow' ? await r.text() : '', ms: Date.now() - t0 };
  } catch {
    return { status: 0, location: '', text: '', ms: Date.now() - t0 };
  }
}

async function check() {
  const map = await get(`${SITE}/sitemap.xml`);
  const urls = sitemapUrls(map.text).filter(u => u.startsWith(SITE)).slice(0, LIMIT);
  const pages: Array<ReturnType<typeof pageCheck> & { ms: number }> = [];
  for (let i = 0; i < urls.length; i += 6) {
    const part = await Promise.all(urls.slice(i, i + 6).map(async u => { const r = await get(u); return { ...pageCheck(u, r.status, r.text), ms: r.ms }; }));
    pages.push(...part);
  }
  const http = await get('http://adervis.ru/', 'manual');
  return {
    at: new Date().toISOString(), sitemap: map.status === 200, total: urls.length, pages,
    https: { redirects: [301, 302, 307, 308].includes(http.status) && http.location.startsWith('https://'), status: http.status }
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  try {
    const auth = req.headers.get('Authorization');
    if (!auth || !PUBLIC_KEY) return json({ error: 'Нужен вход в систему' }, 401);
    const user = createClient(SUPABASE_URL, PUBLIC_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user: me } } = await user.auth.getUser();
    if (!me) return json({ error: 'Нужен вход в систему' }, 401);
    const { data: allowed } = await user.rpc('is_member');
    if (allowed !== true) return json({ error: 'Нет доступа' }, 403);
    const body = await req.json().catch(() => ({}));
    if (body?.action === 'check') return json(await check());
    return json({ error: 'Неизвестное действие' }, 400);
  } catch (e) {
    console.error('site:', e);
    return json({ error: 'Проверка не удалась' }, 500);
  }
});
