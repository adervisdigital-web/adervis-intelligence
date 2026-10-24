// Раздел «Stock» в Hub: сводка Adervis Stock по ключу из его админки.
// Только для вошедших участников; сам ключ в браузер не попадает.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import { admin, json, CORS, SUPABASE_URL, PUBLIC_KEY } from '../_shared/outreach.ts';
import { stockSummary } from '../_shared/stock.ts';

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
    return json(await stockSummary(admin()));
  } catch (e) {
    console.error('stock:', e);
    return json({ error: 'Не удалось получить сводку Stock' }, 500);
  }
});
