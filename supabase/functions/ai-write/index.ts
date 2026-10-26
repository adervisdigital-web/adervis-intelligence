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
  buildPrompt, buildRewritePrompt, buildPitchPrompt, parseReply, sanitizeOptions, sanitizeRewrite, sanitizePitch, usableFacts,
  sanitizeAdTask, buildKeywordPrompt, buildAdPrompt, parseKeywords, parseAds,
  sanitizeContentTask, sanitizePostTask, buildIdeasPrompt, buildPlanPrompt, buildPostPrompt, parseIdeas, parsePlan, parsePost,
  sanitizeBriefTask, buildBriefPrompt, parseBrief, sanitizeAudio, audioRequest, sanitizeCaseTask, buildCasePrompt,
  providerRequest, providerText, modelAttempts, DAILY_LIMIT, RETRY_STATUS, TRUSTED_STATUS, type Provider,
  sanitizeVoiceTask, voiceContext, buildVoicePrompt, parseVoice, ttsRequest, pickTtsModel, toWav,
  sanitizeAsk, askContext, buildAskPrompt, parseAskFull, buildSayPrompt
} from './compose.ts';

// В новых проектах Supabase ключи называются иначе, чем в старых,
// поэтому берём оба варианта.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
const SECRET_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');

// Провайдер, модель и ключ задаются секретами проекта.
// По умолчанию — Gemini: у него есть бесплатный уровень без привязки карты.
const PROVIDER = (Deno.env.get('AI_PROVIDER') || 'gemini') as Provider;
const DEFAULT_MODEL: Record<string, string> = { gemini: 'gemini-3.5-flash', yandex: 'yandexgpt/latest', openai: 'deepseek-chat' };
const DEFAULT_FALLBACK: Record<string, string> = { gemini: 'gemini-3.5-flash-lite', yandex: 'yandexgpt-lite/latest', openai: '' };
const MODEL = Deno.env.get('AI_MODEL') || Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL[PROVIDER] || 'deepseek-chat';
const FALLBACK_MODEL = Deno.env.get('AI_FALLBACK_MODEL') ?? DEFAULT_FALLBACK[PROVIDER] ?? '';
// YandexGPT работает внутри каталога Yandex Cloud
const YANDEX_FOLDER = Deno.env.get('YANDEX_FOLDER_ID') || '';
const AI_KEY = Deno.env.get('AI_API_KEY') || Deno.env.get('GEMINI_API_KEY');
const AI_BASE_URL = Deno.env.get('AI_BASE_URL') || '';
// ТЗ клиентов разбирает Claude — так решили владельцы; он же пишет посты и
// контент-план, когда ключ подключён. Свой ключ и модель:
// ANTHROPIC_API_KEY напрямую или BRIEF_AI_* (например, через шлюз с
// OpenAI-совместимым API). Нет ключа — разбор делает основная модель.
const BRIEF_KEY = Deno.env.get('BRIEF_AI_KEY') || Deno.env.get('ANTHROPIC_API_KEY') || '';
const BRIEF_PROVIDER = (Deno.env.get('BRIEF_AI_PROVIDER') || 'anthropic') as Provider;
const BRIEF_MODEL = Deno.env.get('BRIEF_AI_MODEL') || 'claude-opus-5-5';
const BRIEF_BASE_URL = Deno.env.get('BRIEF_AI_BASE_URL') || '';
// Голосовая сводка читается только Gemini TTS: свой ключ VOICE_AI_KEY или ключ Gemini проекта.
const VOICE_KEY = Deno.env.get('VOICE_AI_KEY') || (PROVIDER === 'gemini' ? AI_KEY : Deno.env.get('GEMINI_API_KEY')) || '';
const VOICE_MODEL = Deno.env.get('VOICE_TTS_MODEL') || '';
const VOICE_NAME = Deno.env.get('VOICE_TTS_VOICE') || 'Leda';

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

    const input = await req.json();

    // Голосовое → текст для брифа: только Gemini принимает аудио в запросе.
    if (input?.mode === 'transcribe') {
      if (PROVIDER !== 'gemini') return json({ error: 'Расшифровка голосовых работает с Gemini, а сейчас подключён другой провайдер.' }, 400);
      const audio = sanitizeAudio(input);
      let payload = null, usedModel = '', lastStatus = 0;
      for (const [i, model] of modelAttempts(MODEL, FALLBACK_MODEL).entries()) {
        const r = audioRequest(model, AI_KEY, AI_BASE_URL, audio);
        const resp = await fetch(r.url, { method: 'POST', headers: r.headers, body: JSON.stringify(r.body) });
        if (resp.ok) { payload = await resp.json(); usedModel = model; break; }
        lastStatus = resp.status;
        console.error('ai-write transcribe:', model, resp.status, (await resp.text()).slice(0, 300));
        if (!RETRY_STATUS.includes(resp.status)) break;
        if (i === 0) await new Promise(res => setTimeout(res, 1500));
      }
      if (!payload) return json({ error: RETRY_STATUS.includes(lastStatus) ? 'Модель сейчас перегружена. Попробуйте через минуту.' : `Расшифровка не удалась (ошибка ${lastStatus}).` }, 502);
      const text = providerText('gemini', payload).trim();
      if (!text) return json({ error: 'В записи не нашлось речи.' }, 422);
      await admin.from('ai_usage').insert({ actor: user.email, model: `gemini/${usedModel}`, drafts: 0, chars: text.length });
      return json({ text: text.slice(0, 20000), model: usedModel, left: Math.max(0, DAILY_LIMIT - (used ?? 0) - 1) });
    }

    // Голосовая сводка по клиенту: бриф и заявку читаем от имени вошедшего человека,
    // текст пишет модель, читает Gemini TTS. В ответе — WAV в base64 и сам текст.
    if (input?.mode === 'voice') {
      if (!VOICE_KEY) return json({ error: 'Для голоса нужен ключ Gemini: секрет VOICE_AI_KEY.' }, 500);
      // «Послушать» ответ Ады — пересказ готового текста; иначе сводка по клиенту
      const say = typeof input?.say === 'string' ? input.say.trim().slice(0, 4000) : '';
      let prompt = say ? buildSayPrompt(say) : '';
      if (!say) {
        const task = sanitizeVoiceTask(input);
        // по заявке берём и её бриф, если он есть: там разбор, КП и вопросы
        const { data: brief } = task.brief ? await supabase.from('briefs').select('*').eq('id', task.brief).maybeSingle()
          : await supabase.from('briefs').select('*').eq('lead_id', task.lead).order('updated_at', { ascending: false }).limit(1).maybeSingle();
        const leadId = task.lead || brief?.lead_id;
        const { data: lead } = leadId ? await supabase.from('leads').select('*').eq('id', leadId).maybeSingle() : { data: null };
        if (!brief && !lead) return json({ error: 'Клиент не найден' }, 404);
        prompt = buildVoicePrompt(voiceContext(brief || {}, lead));
      }

      const claude = !!BRIEF_KEY, provider = claude ? BRIEF_PROVIDER : PROVIDER;
      let script = '', usedModel = '', lastStatus = 0;
      for (const [i, model] of (claude ? modelAttempts(BRIEF_MODEL, '') : modelAttempts(MODEL, FALLBACK_MODEL)).entries()) {
        const r = claude ? providerRequest(BRIEF_PROVIDER, model, BRIEF_KEY, BRIEF_BASE_URL, prompt) : providerRequest(PROVIDER, model, AI_KEY, AI_BASE_URL, prompt, YANDEX_FOLDER);
        const resp = await fetch(r.url, { method: 'POST', headers: r.headers, body: JSON.stringify(r.body) });
        if (resp.ok) { script = parseVoice(providerText(provider, await resp.json())); usedModel = model; break; }
        lastStatus = resp.status;
        console.error('ai-write voice text:', model, resp.status, (await resp.text()).slice(0, 300));
        if (!RETRY_STATUS.includes(resp.status)) break;
        if (i === 0) await new Promise(res => setTimeout(res, 1500));
      }
      if (!script) return json({ error: RETRY_STATUS.includes(lastStatus) ? 'Модель сейчас перегружена. Попробуйте через минуту.' : `Текст сводки не получился (ошибка ${lastStatus}).` }, 502);

      let ttsModel = VOICE_MODEL;
      if (!ttsModel) {
        const list = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': VOICE_KEY } });
        const names = list.ok ? ((await list.json()).models || []).filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m: any) => String(m.name).split('/').pop()) : [];
        ttsModel = pickTtsModel(names);
        if (!ttsModel) return json({ error: 'Ключ Gemini не видит моделей озвучки.', text: script }, 502);
      }
      let audio: Uint8Array | null = null;
      for (let i = 0; i < 3 && !audio; i++) {
        const r = ttsRequest(ttsModel, VOICE_KEY, '', script, VOICE_NAME);
        const resp = await fetch(r.url, { method: 'POST', headers: r.headers, body: JSON.stringify(r.body), signal: AbortSignal.timeout(110_000) });
        if (resp.ok) {
          const part = (await resp.json())?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData)?.inlineData;
          if (part?.data) audio = toWav(Uint8Array.from(atob(part.data), c => c.charCodeAt(0)), part.mimeType || '');
          else break;
        } else {
          lastStatus = resp.status;
          console.error('ai-write voice tts:', ttsModel, resp.status, (await resp.text()).slice(0, 300));
          if (!RETRY_STATUS.includes(resp.status)) break;
          await new Promise(res => setTimeout(res, 3000 * (i + 1)));
        }
      }
      if (!audio) return json({ error: RETRY_STATUS.includes(lastStatus) ? 'Озвучка сейчас перегружена. Текст готов, голос — через минуту.' : `Озвучка не получилась (ошибка ${lastStatus}).`, text: script }, 502);
      let bin = '';
      for (let i = 0; i < audio.length; i += 0x8000) bin += String.fromCharCode(...audio.subarray(i, i + 0x8000));
      await admin.from('ai_usage').insert({ actor: user.email, model: `${provider}/${usedModel}+${ttsModel}`, drafts: 0, chars: script.length });
      return json({ text: script, audio: btoa(bin), mime: 'audio/wav', model: usedModel, voice: ttsModel, left: Math.max(0, DAILY_LIMIT - (used ?? 0) - 1) });
    }

    // «Спросить»: данные читаем от имени вошедшего — политики доступа действуют.
    if (input?.mode === 'ask') {
      const task = sanitizeAsk(input);
      const today = new Date().toISOString().slice(0, 10);
      const [leads, briefs, content, campaigns, facts] = await Promise.all([
        supabase.from('leads').select('name,status,came_on,source,request,next_step,next_on,amount').order('came_on', { ascending: false }).limit(60),
        supabase.from('briefs').select('id,client,title,stage,kp,next_step,next_on,questions').order('updated_at', { ascending: false }).limit(40),
        supabase.from('content').select('title,channel,status,publish_on').order('publish_on', { ascending: false }).limit(40),
        supabase.from('campaigns').select('name,channel,status,budget,spent').limit(20),
        supabase.from('knowledge').select('title,body').eq('access', 'Публичное').in('status', TRUSTED_STATUS).limit(40)
      ]);
      const prompt = buildAskPrompt(task, askContext({ leads: leads.data ?? [], briefs: briefs.data ?? [], content: content.data ?? [], campaigns: campaigns.data ?? [], facts: facts.data ?? [], today }));
      const claude = !!BRIEF_KEY, provider = claude ? BRIEF_PROVIDER : PROVIDER;
      if (task.images.length && !['anthropic', 'gemini'].includes(provider)) return json({ error: 'Скриншоты читают Claude и Gemini, а сейчас подключён другой провайдер.' }, 400);
      let answer = '', usedModel = '', lastStatus = 0, extra: any = {};
      for (const [i, model] of (claude ? modelAttempts(BRIEF_MODEL, '') : modelAttempts(MODEL, FALLBACK_MODEL)).entries()) {
        const r = claude ? providerRequest(BRIEF_PROVIDER, model, BRIEF_KEY, BRIEF_BASE_URL, prompt, '', task.images) : providerRequest(PROVIDER, model, AI_KEY, AI_BASE_URL, prompt, YANDEX_FOLDER, task.images);
        const resp = await fetch(r.url, { method: 'POST', headers: r.headers, body: JSON.stringify(r.body) });
        if (resp.ok) { const full = parseAskFull(providerText(provider, await resp.json())); answer = full.text; extra = { answers: full.answers, reply: full.reply }; usedModel = model; break; }
        lastStatus = resp.status;
        console.error('ai-write ask:', model, resp.status, (await resp.text()).slice(0, 300));
        if (!RETRY_STATUS.includes(resp.status)) break;
        if (i === 0) await new Promise(res => setTimeout(res, 1500));
      }
      if (!answer) return json({ error: RETRY_STATUS.includes(lastStatus) ? 'Модель сейчас перегружена. Попробуйте через минуту.' : `Ответ не получился (ошибка ${lastStatus}).` }, 502);
      await admin.from('ai_usage').insert({ actor: user.email, model: `${provider}/${usedModel}`, drafts: 0, chars: answer.length });
      return json({ text: answer, ...extra, model: usedModel, left: Math.max(0, DAILY_LIMIT - (used ?? 0) - 1) });
    }

    const mode = ['rewrite', 'pitch', 'keywords', 'ads', 'ideas', 'plan', 'post', 'brief', 'case'].includes(input?.mode) ? input.mode : 'write';

    // Публичные и проверенные записи. Политики доступа базы действуют и здесь:
    // запрос идёт от имени вошедшего человека.
    let query = supabase
      .from('knowledge')
      .select('id,title,body,source,access,status')
      .eq('access', 'Публичное')
      .in('status', TRUSTED_STATUS);

    // Можно опереться на выбранные записи. Ограничение «публичное и
    // проверенное» остаётся в силе: выбрать внутреннюю запись нельзя.
    const picked = Array.isArray(input?.records) ? input.records.filter((r: unknown) => typeof r === 'string').slice(0, 60) : [];
    if (picked.length) query = query.in('id', picked);

    const { data: rows, error } = await query.order('category');
    if (error) throw new Error('Не удалось прочитать базу знаний: ' + error.message);

    const facts = usableFacts(rows ?? []);
    // При правке лишние факты только мешают: берём те, на которые черновик
    // уже ссылается, а если ссылок нет — не подкладываем ничего.
    // Первое сообщение компании опирается на её карточку, а не на базу знаний.
    const adTask = ['keywords', 'ads'].includes(mode) ? sanitizeAdTask(input) : null;
    const contentTask = ['ideas', 'plan'].includes(mode) ? sanitizeContentTask(input) : null;
    const postTask = mode === 'post' ? sanitizePostTask(input) : null;
    const caseTask = mode === 'case' ? sanitizeCaseTask(input) : null;
    // Разбор ТЗ клиента: текст ТЗ уходит в модель, ставки студии — нет.
    const briefTask = mode === 'brief' ? sanitizeBriefTask(input) : null;
    const prompt = mode === 'brief' ? buildBriefPrompt(briefTask!, facts)
      : mode === 'ideas' ? buildIdeasPrompt(contentTask!, facts)
      : mode === 'plan' ? buildPlanPrompt(contentTask!, facts)
      : mode === 'post' ? buildPostPrompt(postTask!, facts)
      : mode === 'case' ? buildCasePrompt(caseTask!, facts)
      : mode === 'pitch'
      ? buildPitchPrompt(sanitizePitch(input))
      : mode === 'keywords' ? buildKeywordPrompt(adTask!, facts)
      : mode === 'ads' ? buildAdPrompt(adTask!, facts)
      : mode === 'rewrite'
        ? buildRewritePrompt(picked.length ? facts : [], sanitizeRewrite(input))
        : buildPrompt(facts, sanitizeOptions(input));

    let payload = null;
    let usedModel = '';
    let lastStatus = 0;
    const claude = ['brief', 'post', 'plan', 'ideas', 'case'].includes(mode) && !!BRIEF_KEY;
    const provider = claude ? BRIEF_PROVIDER : PROVIDER;

    for (const [i, model] of (claude ? modelAttempts(BRIEF_MODEL, '') : modelAttempts(MODEL, FALLBACK_MODEL)).entries()) {
      const request = claude ? providerRequest(BRIEF_PROVIDER, model, BRIEF_KEY, BRIEF_BASE_URL, prompt)
        : providerRequest(PROVIDER, model, AI_KEY, AI_BASE_URL, prompt, YANDEX_FOLDER);
      const resp = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body)
      });
      if (resp.ok) { payload = await resp.json(); usedModel = model; break; }

      lastStatus = resp.status;
      console.error('ai-write:', provider, model, resp.status, (await resp.text()).slice(0, 400));
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

    const text = providerText(provider, payload);
    if (!text) {
      console.error('ai-write: пустой ответ', JSON.stringify(payload).slice(0, 500));
      return json({ error: 'AI-сервис вернул пустой ответ. Попробуйте ещё раз.' }, 502);
    }

    // Фразы и объявления — свой ответ: у них нет «черновиков со ссылками».
    if (adTask || contentTask || postTask || briefTask || caseTask) {
      const parsed = mode === 'brief' ? parseBrief(text, briefTask!)
        : mode === 'keywords' ? parseKeywords(text, adTask!)
        : mode === 'ads' ? parseAds(text, adTask!)
        : mode === 'ideas' ? parseIdeas(text, contentTask!)
        : mode === 'plan' ? parsePlan(text, contentTask!)
        : parsePost(text, (postTask || caseTask)!.network);
      await admin.from('ai_usage').insert({ actor: user.email, model: `${provider}/${usedModel}`, drafts: 0, chars: text.length });
      return json({ ...parsed, model: usedModel, left: Math.max(0, DAILY_LIMIT - (used ?? 0) - 1) });
    }
    const { drafts, gaps } = parseReply(text, mode === 'pitch' ? [] : facts.map(f => f.id));

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
