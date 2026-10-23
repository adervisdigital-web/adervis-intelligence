// КП-ссылка: страница kp.html спрашивает КП по токену. Функция отдаёт снимок
// (без часов и ставок студии), считает просмотры и пишет руководителям в
// Telegram, когда клиент открыл КП — в первый раз и снова после перерыва.
// action: 'choose' — клиент выбрал вариант и дополнительные работы: сумму
// считаем здесь по снимку, сохраняем выбор, пишем в Telegram и ставим дело
// в заявке. Вход не нужен: доступ даёт только случайный токен из ссылки.

import { admin, json, CORS } from '../_shared/outreach.ts';
import { sendDigest, INTEL_TOKEN } from '../_shared/digest-run.ts';
import { choiceOf, budgetOf, rub } from '../_shared/kp-choice.ts';

const AGAIN_AFTER = 2 * 3600e3;   // повторное открытие — уведомляем не чаще раза в 2 часа
const CHOICE_AGAIN = 60e3;        // двойной клик по «Отправить» — второй раз не шлём
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? '');
    if (!/^[A-Za-z0-9]{20,40}$/.test(token)) return json({ error: 'Ссылка неполная. Проверьте, что скопировали её целиком' }, 404);
    const sb = admin();
    const { data: row } = await sb.from('kp_shares').select('*').eq('token', token).maybeSingle();
    if (!row) return json({ error: 'Предложение не найдено или снято с публикации' }, 404);
    const d = row.data ?? {};
    const subs = async () => (await sb.from('digest_subscribers').select('chat_id')).data ?? [];

    // дело в заявке и сообщение руководителям — общее для выбора и бюджета
    const notify = async (step: string, text: string) => {
      const { data: brief } = await sb.from('briefs').select('lead_id').eq('id', row.brief_id).maybeSingle();
      if (brief?.lead_id) await sb.from('leads').update({ next_step: step.slice(0, 300), next_on: new Date().toISOString().slice(0, 10) }).eq('id', brief.lead_id);
      if (INTEL_TOKEN) for (const s of await subs()) await sendDigest(Number(s.chat_id), text);
    };

    if (body?.action === 'budget') {
      const bgt = budgetOf(d, body);
      if (!bgt) return json({ error: 'Укажите сумму в рублях, например 300 000' }, 400);
      if (body?.preview === true) return json({ ok: true, preview: true, amount: bgt.amount });
      const now = new Date();
      if (row.chosen_at && now.getTime() - Date.parse(row.chosen_at) < CHOICE_AGAIN && row.choice?.amount === bgt.amount) return json({ ok: true, amount: bgt.amount });
      await sb.from('kp_shares').update({ choice: { ...bgt, at: now.toISOString() }, chosen_at: now.toISOString() }).eq('token', token);
      await notify(`Клиент предложил свой бюджет по КП: ${rub(bgt.amount)}. Связаться: что можно сделать в эту сумму`,
        `💬 Клиент предложил свой бюджет по КП «${d.title ?? ''}»${d.client ? ` (${d.client})` : ''}: ${rub(bgt.amount)}.
` +
        `Наша цена: ${bgt.from ? 'от ' : ''}${rub(bgt.ours)}.
Свяжитесь сегодня: обсудите, что можно сделать в эту сумму.`);
      return json({ ok: true, amount: bgt.amount });
    }

    if (body?.action === 'choose') {
      const c = choiceOf(d, body);
      if (body?.preview === true) return json({ ok: true, preview: true, total: c.total });
      const now = new Date();
      if (row.chosen_at && now.getTime() - Date.parse(row.chosen_at) < CHOICE_AGAIN && row.choice?.total === c.total) return json({ ok: true, total: c.total });
      await sb.from('kp_shares').update({ choice: { ...c, at: now.toISOString() }, chosen_at: now.toISOString() }).eq('token', token);
      const what = [c.label, ...c.options.map(o => o.name.split(':')[0].trim())].join(' + ');
      await notify(`Клиент выбрал в КП: ${what}, ${rub(c.total)}. Связаться: договор и предоплата`,
        `✅ Клиент выбрал вариант в КП «${d.title ?? ''}»${d.client ? ` (${d.client})` : ''}:\n${what}: ${rub(c.total)}.` +
        `${c.comment ? `\nКомментарий: «${c.comment}»` : ''}\nСвяжитесь сегодня: договор и предоплата.`);
      return json({ ok: true, total: c.total });
    }

    if (body?.preview !== true) {
      const now = new Date(), last = row.last_view_at ? Date.parse(row.last_view_at) : 0;
      const views = (row.views ?? 0) + 1;
      await sb.from('kp_shares').update({ views, last_view_at: now.toISOString(), first_view_at: row.first_view_at ?? now.toISOString() }).eq('token', token);
      if (INTEL_TOKEN && (!last || now.getTime() - last > AGAIN_AFTER)) {
        const text = `👀 ${views === 1 ? 'Клиент открыл КП' : `КП открыли снова (${views}-й раз)`}: «${d.title ?? ''}»${d.client ? ` (${d.client})` : ''}.\nСамое время написать и предложить созвон.`;
        for (const s of await subs()) await sendDigest(Number(s.chat_id), text);
      }
    }
    return json({ ok: true, data: d, updated_at: row.updated_at });
  } catch (e) {
    console.error('kp:', e);
    return json({ error: 'Не удалось открыть предложение' }, 500);
  }
});
