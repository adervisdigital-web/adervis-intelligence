// КП-ссылка: страница kp.html спрашивает КП по токену. Функция отдаёт снимок
// (без часов и ставок студии), считает просмотры и пишет руководителям в
// Telegram, когда клиент открыл КП — в первый раз и снова после перерыва.
// Вход не нужен: доступ даёт только случайный токен из ссылки.

import { admin, json, CORS } from '../_shared/outreach.ts';
import { sendDigest, INTEL_TOKEN } from '../_shared/digest-run.ts';

const AGAIN_AFTER = 2 * 3600e3;   // повторное открытие — уведомляем не чаще раза в 2 часа

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? '');
    if (!/^[A-Za-z0-9]{20,40}$/.test(token)) return json({ error: 'Ссылка неполная — проверьте, что скопировали её целиком' }, 404);
    const sb = admin();
    const { data: row } = await sb.from('kp_shares').select('*').eq('token', token).maybeSingle();
    if (!row) return json({ error: 'Предложение не найдено или снято с публикации' }, 404);
    if (body?.preview !== true) {
      const now = new Date(), last = row.last_view_at ? Date.parse(row.last_view_at) : 0;
      const views = (row.views ?? 0) + 1;
      await sb.from('kp_shares').update({ views, last_view_at: now.toISOString(), first_view_at: row.first_view_at ?? now.toISOString() }).eq('token', token);
      if (INTEL_TOKEN && (!last || now.getTime() - last > AGAIN_AFTER)) {
        const d = row.data ?? {};
        const text = `👀 ${views === 1 ? 'Клиент открыл КП' : `КП открыли снова (${views}-й раз)`}: «${d.title ?? ''}»${d.client ? ` — ${d.client}` : ''}.\nСамое время написать и предложить созвон.`;
        const { data: subs } = await sb.from('digest_subscribers').select('chat_id');
        for (const s of subs ?? []) await sendDigest(Number(s.chat_id), text);
      }
    }
    return json({ ok: true, data: row.data, updated_at: row.updated_at });
  } catch (e) {
    console.error('kp:', e);
    return json({ error: 'Не удалось открыть предложение' }, 500);
  }
});
