// Парсер площадок: что реально вышло в канале и сколько набрало просмотров.
//
// Почему через сервер: браузер не может читать чужие сайты (CORS), а ключ VK
// не должен попадать в приложение. Функция только читает — сопоставляет
// посты с планом и записывает просмотры само приложение, от имени человека.
// Адрес канала берётся из таблицы аккаунтов, а не из запроса: иначе функцию
// можно было бы использовать как прокси к любому адресу.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import { cleanHandle, FEED_NETWORKS, feedUrl, parseFeed } from './compose.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
const VK_TOKEN = Deno.env.get('VK_SERVICE_TOKEN') ?? undefined;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

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
    const network = String(body?.network || '');
    if (!FEED_NETWORKS.includes(network)) return json({ error: `Площадку «${network}» парсер пока не читает` }, 400);

    const { data: account } = await supabase.from('social_accounts')
      .select('handle').eq('network', network).maybeSingle();
    if (!account?.handle) return json({ error: `Не указан аккаунт ${network}: впишите его в карточке площадки` }, 400);

    const handle = cleanHandle(network, account.handle);
    const resp = await fetch(feedUrl(network, handle, VK_TOKEN), {
      headers: { 'User-Agent': 'Mozilla/5.0 (ADERVIS Intelligence feed)', 'Accept-Language': 'ru' }
    });
    if (!resp.ok) {
      return json({ error: resp.status === 404 ? `${network}: канал «${handle}» не найден` : `${network} ответил ${resp.status}` }, 502);
    }
    const posts = parseFeed(network, await resp.text(), handle);
    return json({ ok: true, network, handle, posts, at: new Date().toISOString() });
  } catch (e) {
    console.error('feed:', e);
    return json({ error: e instanceof Error ? e.message : 'Неизвестная ошибка' }, 400);
  }
});
