// Раздел «Stock» в Hub: сводка Adervis Stock по ключу из его админки.
// Только для вошедших участников; сам ключ в браузер не попадает.
// По расписанию (секрет расписания, как у сводки): проверка сайта и облака, тревоги в Telegram.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import { admin, secret, json, CORS, SUPABASE_URL, PUBLIC_KEY, sameSecret, type Sb } from '../_shared/outreach.ts';
import { stockPanel, stockWatch } from '../_shared/stock.ts';
import { sendDigest, INTEL_TOKEN } from '../_shared/digest-run.ts';

async function notify(sb: Sb, text: string) {
  if (!INTEL_TOKEN) return;
  const { data: subs } = await sb.from('digest_subscribers').select('chat_id');
  for (const s of subs ?? []) await sendDigest(Number(s.chat_id), text);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  try {
    const cron = req.headers.get('x-digest-secret');
    if (cron !== null) {
      const sb = admin();
      if (!sameSecret(cron, await secret(sb, 'digest_secret'))) return json({ error: 'forbidden' }, 401);
      return json(await stockWatch(sb, text => notify(sb, text)));
    }
    const auth = req.headers.get('Authorization');
    if (!auth || !PUBLIC_KEY) return json({ error: 'Нужен вход в систему' }, 401);
    const user = createClient(SUPABASE_URL, PUBLIC_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user: me } } = await user.auth.getUser();
    if (!me) return json({ error: 'Нужен вход в систему' }, 401);
    const { data: allowed } = await user.rpc('is_member');
    if (allowed !== true) return json({ error: 'Нет доступа' }, 403);
    return json(await stockPanel(admin()));
  } catch (e) {
    console.error('stock:', e);
    return json({ error: 'Не удалось получить сводку Stock' }, 500);
  }
});
