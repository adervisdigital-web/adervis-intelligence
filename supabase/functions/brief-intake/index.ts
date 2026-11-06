// Бриф со страницы hub.adervis.ru/brief.html → заявка и бриф в Hub, уведомление
// менеджеру в Telegram (бот продаж, чат из «Диалоги» → «Каналы»). Вход не нужен:
// принимаем только со своих страниц, один и тот же бриф дважды не заводится.

import { admin, permToday, secret, settings, tgSend } from '../_shared/outreach.ts';
import { briefIntakeOf } from '../_shared/brief-intake.ts';

const ORIGINS = ['https://hub.adervis.ru', 'https://adervisdigital-web.github.io'];

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey', 'Vary': 'Origin' };
  const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return out({ ok: false }, 405);
  if (!ORIGINS.includes(origin)) return out({ ok: false, error: 'forbidden_origin' }, 403);
  try {
    const raw = await req.text();
    if (raw.length > 60000) return out({ ok: false, error: 'too_big' }, 413);
    const b = briefIntakeOf(JSON.parse(raw || '{}'), permToday());
    if (!b) return out({ ok: false, error: 'bad_brief' }, 400);
    const sb = admin();
    const { data: had } = await sb.from('leads').select('id').eq('id', b.lead.id).maybeSingle();
    if (had) return out({ ok: true, again: true });                 // тот же бриф второй раз: молча принимаем
    const { error: le } = await sb.from('leads').insert(b.lead);
    if (le) { console.error('brief-intake lead:', le.message); return out({ ok: false }, 500); }
    const { error: be } = await sb.from('briefs').insert(b.brief);
    if (be) console.error('brief-intake brief:', be.message);
    const [tok, cfg] = await Promise.all([secret(sb, 'tg_bot_token'), settings(sb)]);
    if (tok && cfg.manager_chat_id) await tgSend(tok, Number(cfg.manager_chat_id), b.notify).catch(() => {});
    return out({ ok: true });
  } catch (e) {
    console.error('brief-intake:', e);
    return out({ ok: false }, 500);
  }
});
