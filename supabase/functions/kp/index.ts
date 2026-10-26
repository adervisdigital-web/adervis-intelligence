// КП-ссылка: страница kp.html спрашивает КП по токену. Функция отдаёт снимок
// (без часов и ставок студии), считает просмотры и пишет руководителям в
// Telegram, когда клиент открыл КП — в первый раз и снова после перерыва.
// action: 'choose' — клиент выбрал вариант и дополнительные работы: сумму
// считаем здесь по снимку, сохраняем выбор, пишем в Telegram и ставим дело
// в заявке. Вход не нужен: доступ даёт только случайный токен из ссылки.

import { admin, json, CORS } from '../_shared/outreach.ts';
import { sendDigest, INTEL_TOKEN } from '../_shared/digest-run.ts';
import { choiceOf, budgetOf, rub } from '../_shared/kp-choice.ts';
import { clientVoice, sendAudio, voiceReady } from '../_shared/voice.ts';
import { sanitizeTrack, mergeTrack, engageSummary, engageLine } from '../_shared/kp-engage.ts';

const AGAIN_AFTER = 2 * 3600e3;   // повторное открытие — уведомляем не чаще раза в 2 часа
const CHOICE_AGAIN = 60e3;        // двойной клик по «Отправить» — второй раз не шлём
// Сколько дней назад истёк срок КП (0 — ещё действует или срок не задан).
// Срок — дата КП плюс valid календарных дней; в старых снимках срока нет.
const expiredDays = (d: any) => {
  const valid = Number(d?.valid) || 0;
  if (!valid || !/^\d{4}-\d{2}-\d{2}$/.test(String(d?.date))) return 0;
  const until = Date.parse(d.date + 'T23:59:59+05:00') + valid * 864e5;
  return Math.max(0, Math.ceil((Date.now() - until) / 864e5));
};

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

    // Как клиент читает КП: время, разделы, ролик, скачивание сметы. Визит
    // перевалил за 2 минуты — один раз пишем руководителям: самое время позвонить.
    if (body?.action === 'track') {
      if (body?.preview === true) return json({ ok: true, preview: true });
      const t = sanitizeTrack(body);
      if (!t) return json({ error: 'bad track' }, 400);
      const m = mergeTrack(row.engagement ?? {}, t, new Date().toISOString());
      await sb.from('kp_shares').update({ engagement: m.eng }).eq('token', token);
      if (m.hot && INTEL_TOKEN) {
        const text = `🔥 Клиент изучает КП «${d.title ?? ''}»${d.client ? ` (${d.client})` : ''} уже ${Math.round(m.visit.sec / 60)} мин: ` +
          `${engageLine(engageSummary([m.visit]))}.\nХороший момент написать или позвонить.`;
        for (const s of await subs()) await sendDigest(Number(s.chat_id), text);
      }
      return json({ ok: true });
    }

    // закрытая ссылка: без цен и деталей, только кто и как связаться
    if (row.closed_at) return json({ ok: true, closed: true, data: { title: d.title, client: d.client, contact: d.contact, phone: d.phone } });
    // срок КП истёк — выбрать по старой цене нельзя, можно попросить обновить
    const expired = expiredDays(d);
    if (body?.action === 'renew') {
      if (body?.preview === true) return json({ ok: true, preview: true });
      if (row.renew_at && Date.now() - Date.parse(row.renew_at) < CHOICE_AGAIN) return json({ ok: true });
      await sb.from('kp_shares').update({ renew_at: new Date().toISOString() }).eq('token', token);
      await notify(`Клиент просит обновить КП: срок предложения истёк. Пересчитать и нажать «Обновить страницу»`,
        `🔄 Клиент просит обновить КП «${d.title ?? ''}»${d.client ? ` (${d.client})` : ''}: срок предложения истёк.\nПересчитайте и нажмите в брифе «Обновить страницу», ссылка останется та же. Хороший повод написать сегодня.`);
      return json({ ok: true });
    }
    if (expired > 0 && (body?.action === 'choose' || body?.action === 'budget')) return json({ error: 'Предложение устарело. Нажмите «Обновить предложение», и мы пришлём актуальные цены.' }, 409);

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
        const text = `👀 ${views === 1 ? 'Клиент открыл КП' : `КП открыли снова (${views}-й раз)`}: «${d.title ?? ''}»${d.client ? ` (${d.client})` : ''}.\n${expired > 0 ? `Срок КП истёк ${expired} ${expired % 10 === 1 && expired % 100 !== 11 ? 'день' : [2, 3, 4].includes(expired % 10) && ![12, 13, 14].includes(expired % 100) ? 'дня' : 'дней'} назад: хороший повод написать и прислать обновлённое предложение.` : 'Самое время написать и предложить созвон.'}`;
        for (const s of await subs()) await sendDigest(Number(s.chat_id), text);
        // в первый раз — ещё и голосовое «кто это за клиент». Готовится в фоне:
        // страница КП у клиента открывается без задержки.
        if (views === 1 && voiceReady()) {
          const job = (async () => {
            try {
              const v = await clientVoice(sb, row.brief_id);
              for (const s of await subs()) await sendAudio(INTEL_TOKEN, Number(s.chat_id), v.audio, `Кто это: ${d.client || d.title || 'клиент'}`, v.text);
            } catch (e) { console.error('kp voice:', e); }
          })();
          (globalThis as any).EdgeRuntime?.waitUntil?.(job);
        }
      }
    }
    return json({ ok: true, data: d, updated_at: row.updated_at });
  } catch (e) {
    console.error('kp:', e);
    return json({ error: 'Не удалось открыть предложение' }, 500);
  }
});
