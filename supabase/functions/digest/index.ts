// Утренняя сводка по расписанию: pg_cron вызывает функцию раз в час
// (supabase/cron/digest.sql), а она отправляет «На сегодня» тем, у кого
// наступил выбранный час по Перми и кому сегодня ещё не отправляла.
// Без секрета расписания функция ничего не делает.

import { admin, secret, sameSecret, json } from '../_shared/outreach.ts';
import { permNow } from '../_shared/digest.ts';
import { buildDigest, sendDigest, INTEL_TOKEN } from '../_shared/digest-run.ts';

Deno.serve(async (req) => {
  const sb = admin();
  if (!sameSecret(req.headers.get('x-digest-secret') ?? '', await secret(sb, 'digest_secret'))) return json({ error: 'forbidden' }, 401);
  if (!INTEL_TOKEN) return json({ error: 'Нет ключа служебного бота' }, 500);
  const { hour, date } = permNow(Date.now());
  const { data: subs } = await sb.from('digest_subscribers').select('*').eq('hour', hour);
  const due = (subs ?? []).filter((s: any) => s.last_sent !== date);
  if (!due.length) return json({ ok: true, sent: 0 });
  const text = await buildDigest(sb);
  let sent = 0;
  for (const s of due) {
    const r = await sendDigest(Number(s.chat_id), text);
    if (r?.ok) { sent++; await sb.from('digest_subscribers').update({ last_sent: date }).eq('chat_id', s.chat_id); }
    else console.error('digest:', s.chat_id, r?.description);
  }
  return json({ ok: true, sent });
});
