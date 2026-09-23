// Серверная функция: пишет черновики текстов по проверенным фактам базы.
//
// Почему сбор фактов происходит здесь, а не в браузере: приложение присылает
// только задачу. Список фактов функция собирает из базы сама и берёт лишь
// публичные и проверенные записи. Даже подменив страницу, внутренние сведения
// в запрос к модели не отправить.
//
// Ключ Gemini хранится в секретах проекта и в браузер не попадает.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import {
  buildPrompt, parseReply, sanitizeOptions, usableFacts, providerRequest, providerText,
  modelAttempts, DAILY_LIMIT, RETRY_STATUS, TRUSTED_STATUS, type Provider
} from './compose.ts';

// В новых проектах Supabase ключи называются иначе, чем в старых,
// поэтому берём оба варианта.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
const SECRET_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');

// Провайдер, модель и ключ задаются секретами проекта.
// По умолчанию — Gemini: у него есть бесплатный уровень без привязки карты.
const PROVIDER = (Deno.env.get('AI_PROVIDER') || 'gemini') as Provider;
const MODEL = Deno.env.get('AI_MODEL') || Deno.env.get('GEMINI_MODEL')
  || (PROVIDER === 'gemini' ? 'gemini-3.5-flash' : 'deepseek-chat');
const FALLBACK_MODEL = Deno.env.get('AI_FALLBACK_MODEL')
  || (PROVIDER === 'gemini' ? 'gemini-3.5-flash-lite' : '');
const AI_KEY = Deno.env.get('AI_API_KEY') || Deno.env.get('GEMINI_API_KEY');
const AI_BASE_URL = Deno.env.get('AI_BASE_URL') || '';

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

    if (!PUBLIC_KEY || !SECRET_KEY) {
      console.error('ai-write: в окружении нет ключей проекта');
      return json({ error: 'Функция настроена неполностью: не найдены ключи проекта' }, 500);
    }

    const supabase = createClient(SUPABASE_URL, PUBLIC_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Нужен вход в систему' }, 401);

    const { data: allowed } = await supabase.rpc('is_member');
    if (allowed !== true) return json({ error: 'Нет доступа' }, 403);

    if (!AI_KEY) return json({ error: 'Ключ AI-провайдера не настроен в проекте' }, 500);

    // Лимит считаем служебным ключом: приложение не может подправить свой счётчик.
    const admin = createClient(SUPABASE_URL, SECRET_KEY);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: used } = await admin.from('ai_usage')
      .select('*', { count: 'exact', head: true })
      .eq('actor', user.email)
      .gte('at', since);

    if ((used ?? 0) >= DAILY_LIMIT) {
      return json({ error: `Дневной лимит исчерпан: ${DAILY_LIMIT} запросов за сутки. Попробуйте завтра.` }, 429);
    }

    const options = sanitizeOptions(await req.json());

    // Публичные и проверенные записи. Политики доступа базы действуют и здесь:
    // запрос идёт от имени вошедшего человека.
    const { data: rows, error } = await supabase
      .from('knowledge')
      .select('id,title,body,source,access,status')
      .eq('access', 'Публичное')
      .in('status', TRUSTED_STATUS)
      .order('category');
    if (error) throw new Error('Не удалось прочитать базу знаний: ' + error.message);

    const facts = usableFacts(rows ?? []);
    const prompt = buildPrompt(facts, options);

    let payload = null;
    let usedModel = '';
    let lastStatus = 0;

    for (const [i, model] of modelAttempts(MODEL, FALLBACK_MODEL).entries()) {
      const request = providerRequest(PROVIDER, model, AI_KEY, AI_BASE_URL, prompt);
      const resp = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body)
      });
      if (resp.ok) { payload = await resp.json(); usedModel = model; break; }

      lastStatus = resp.status;
      console.error('ai-write:', PROVIDER, model, resp.status, (await resp.text()).slice(0, 400));
      if (!RETRY_STATUS.includes(resp.status)) break;
      if (i === 0) await new Promise(r => setTimeout(r, 1500));
    }

    if (!payload) {
      return json({
        error: RETRY_STATUS.includes(lastStatus)
          ? 'Модель сейчас перегружена. Попробуйте ещё раз через минуту.'
          : `AI-сервис ответил ошибкой ${lastStatus}. Попробуйте ещё раз.`
      }, 502);
    }

    const text = providerText(PROVIDER, payload);
    if (!text) {
      console.error('ai-write: пустой ответ', JSON.stringify(payload).slice(0, 500));
      return json({ error: 'AI-сервис вернул пустой ответ. Попробуйте ещё раз.' }, 502);
    }

    const { drafts, gaps } = parseReply(text, facts.map(f => f.id));

    await admin.from('ai_usage').insert({
      actor: user.email,
      model: `${PROVIDER}/${usedModel}`,
      drafts: drafts.length,
      chars: drafts.reduce((n, d) => n + d.body.length, 0)
    });

    return json({
      drafts,
      gaps,
      model: usedModel,
      factsUsed: facts.length,
      left: Math.max(0, DAILY_LIMIT - (used ?? 0) - 1)
    });
  } catch (e) {
    console.error('ai-write:', e);
    return json({ error: e instanceof Error ? e.message : 'Неизвестная ошибка' }, 400);
  }
});
