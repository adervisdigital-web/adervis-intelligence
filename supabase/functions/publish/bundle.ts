// ВНИМАНИЕ: файл собран автоматически из compose.ts и index.ts.
// Правьте те файлы и пересоберите: node tools/bundle.mjs

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

// Подготовка публикации и разбор ответа канала.
// Здесь нет обращений к сети и к базе — эту часть проверяют тесты.

export const TELEGRAM_LIMIT = 4096;
export const PUBLISHABLE_STATUS = 'Утверждено';

export type Post = { id: string; title: string; body: string; status: string; channel: string };

const escapeHtml = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Почему так строго: публикация необратима. Пропускаем только то, что
// человек сознательно утвердил, и только один раз в канал.
export function checkPublishable(post: Post | null, alreadySent: number, channel: string): void {
  if (!post) throw new Error('Публикация не найдена');
  if (post.status !== PUBLISHABLE_STATUS) {
    throw new Error(`Публикуются только материалы со статусом «${PUBLISHABLE_STATUS}». Сейчас статус: «${post.status}».`);
  }
  if (alreadySent > 0) throw new Error(`Этот материал уже отправлен в ${channel}. Повторная отправка отключена.`);
  if (!post.body.trim()) throw new Error('Пустой текст публиковать нельзя');
}

export function buildMessage(post: Post): { text: string; parse_mode: string } {
  const title = post.title.trim();
  const body = post.body.trim();
  // Заголовок в Threads и Telegram — рабочее название, в текст его выносим
  // только если он не повторяет первую строку.
  const firstLine = body.split('\n')[0].trim();
  const head = title && title !== firstLine ? `<b>${escapeHtml(title)}</b>\n\n` : '';
  const text = head + escapeHtml(body);
  if (text.length > TELEGRAM_LIMIT) {
    throw new Error(`Текст длиннее ${TELEGRAM_LIMIT} знаков (${text.length}). Сократите или разбейте на части.`);
  }
  return { text, parse_mode: 'HTML' };
}

// Телеграм отвечает кодами, которые человеку ничего не говорят.
export function telegramError(status: number, payload: any): string {
  const raw = String(payload?.description || '');
  if (/chat not found/i.test(raw)) return 'Канал не найден. Проверьте идентификатор канала в настройках проекта.';
  if (/bot is not a member|not enough rights|CHAT_ADMIN_REQUIRED/i.test(raw)) {
    return 'Бот не может писать в канал. Добавьте его администратором с правом публикации.';
  }
  if (/bot was blocked|bot was kicked/i.test(raw)) return 'Бота удалили из канала. Верните его администратором.';
  if (/unauthorized/i.test(raw) || status === 401) return 'Неверный токен бота. Проверьте секрет TELEGRAM_BOT_TOKEN.';
  if (status === 429) return 'Слишком часто. Подождите минуту и повторите.';
  return `Телеграм ответил ошибкой ${status}${raw ? ': ' + raw : ''}`;
}

// Ссылка собирается, только если канал публичный: у приватных её нет.
export function messageUrl(result: any): string {
  const name = result?.chat?.username;
  const id = result?.message_id;
  return name && id ? `https://t.me/${name}/${id}` : '';
}

// Публикация материала в канал. Сейчас поддержан Telegram.
//
// Почему через сервер: токен бота не должен попадать в браузер, а отметка
// «опубликовано» не должна появляться без настоящей отправки. Приложение
// присылает только номер материала — текст функция берёт из базы сама.


const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
const SECRET_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

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
    if (!PUBLIC_KEY || !SECRET_KEY) return json({ error: 'Функция настроена неполностью: нет ключей проекта' }, 500);

    const supabase = createClient(SUPABASE_URL, PUBLIC_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Нужен вход в систему' }, 401);

    const { data: allowed } = await supabase.rpc('is_member');
    if (allowed !== true) return json({ error: 'Нет доступа' }, 403);

    const body = await req.json().catch(() => ({}));
    const channel = String(body?.channel || 'Telegram');
    if (channel !== 'Telegram') return json({ error: `Канал «${channel}» пока не подключён` }, 400);
    if (!BOT_TOKEN || !CHAT_ID) {
      return json({ error: 'Telegram не подключён: в проекте нет секретов TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID' }, 400);
    }

    const postId = String(body?.postId || '');
    const { data: post } = await supabase.from('content')
      .select('id,title,body,status,channel').eq('id', postId).maybeSingle();

    const { count: sent } = await supabase.from('publications')
      .select('*', { count: 'exact', head: true }).eq('post', postId).eq('channel', channel);

    checkPublishable(post, sent ?? 0, channel);
    const message = buildMessage(post!);

    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, ...message })
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || !payload?.ok) {
      console.error('publish: telegram', resp.status, JSON.stringify(payload).slice(0, 300));
      return json({ error: telegramError(resp.status, payload) }, 502);
    }

    const url = messageUrl(payload.result);
    const admin = createClient(SUPABASE_URL, SECRET_KEY);
    await admin.from('publications').insert({
      post: postId, channel, actor: user.email,
      external_id: String(payload.result?.message_id ?? ''), url
    });
    // Статус меняем от имени человека: в журнале должно быть видно, кто отправил.
    await supabase.from('content').update({ status: 'Опубликовано' }).eq('id', postId);

    return json({ ok: true, url, channel, at: new Date().toISOString() });
  } catch (e) {
    console.error('publish:', e);
    return json({ error: e instanceof Error ? e.message : 'Неизвестная ошибка' }, 400);
  }
});
