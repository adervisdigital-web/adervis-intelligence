// Заявка с формы adervis.ru → лид в воронке Hub. Форма по-прежнему пишет в
// Telegram-группу через свой Cloudflare-воркер, а сюда шлёт тот же текст.
// Вход не нужен: принимаем только со своего сайта, одну заявку — один раз
// (номер лида — отпечаток текста за день).

import { admin, permToday } from '../_shared/outreach.ts';
import { siteLeadOf, fingerprint } from '../_shared/site.ts';

const ORIGINS = ['https://adervis.ru', 'https://www.adervis.ru'];

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
  const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return out({ ok: false }, 405);
  if (!ORIGINS.includes(origin)) return out({ ok: false, error: 'forbidden_origin' }, 403);
  try {
    const body = await req.json().catch(() => ({}));
    const lead = siteLeadOf(body?.text);
    if (!lead) return out({ ok: false, error: 'bad_lead' }, 400);
    const today = permToday();
    const note = [lead.page && `Страница: ${lead.page}`, lead.utm && `UTM: ${lead.utm}`, lead.referrer && `Переход с: ${lead.referrer}`,
      lead.lastCase && `Смотрел кейс: ${lead.lastCase}`].filter(Boolean).join('\n');
    const { error } = await admin().from('leads').upsert({
      id: `site-${today}-${fingerprint(lead.text)}`, came_on: today, name: lead.name, source: 'Сайт', direction: 'Студия',
      request: lead.request, amount: 0, status: 'Новое', note: `Заявка с формы adervis.ru.\n${note}`.slice(0, 1000), reached: 0,
      next_step: 'Ответить на заявку с сайта', next_on: today, lost_reason: ''
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) { console.error('site-lead:', error.message); return out({ ok: false }, 500); }
    return out({ ok: true });
  } catch (e) {
    console.error('site-lead:', e);
    return out({ ok: false }, 500);
  }
});
