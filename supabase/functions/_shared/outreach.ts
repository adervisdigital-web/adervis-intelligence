// Общее для функций переписки: ключи, настройки, Telegram, сообщения, ИИ.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import { providerRequest, providerText, modelAttempts, RETRY_STATUS, TRUSTED_STATUS, type Provider } from '../ai-write/compose.ts';
import { vkKeyboard, keyboardAsText, type Fact, type Keyboard } from './bot.ts';
import { addMessage, history, type Channel, type Deps } from './flow.ts';

export { addMessage, history };

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
export const SECRET_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');

export type Sb = ReturnType<typeof createClient>;
export const admin = (): Sb => createClient(SUPABASE_URL, SECRET_KEY!);

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function secret(sb: Sb, name: string): Promise<string> {
  const { data } = await sb.from('channel_secrets').select('value').eq('name', name).maybeSingle();
  return (data?.value as string) ?? '';
}

export async function settings(sb: Sb): Promise<Record<string, any>> {
  const { data } = await sb.from('outreach_settings').select('*').eq('id', 'main').maybeSingle();
  return (data as Record<string, any>) ?? {};
}

export async function tgApi(tok: string, method: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${tok}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000)
  });
  return res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
}

export async function tgSend(tok: string, chatId: number, text: string, keyboard?: Keyboard) {
  const body: Record<string, unknown> = { chat_id: chatId, text: text.slice(0, 4096) };
  if (keyboard) body.reply_markup = keyboard;
  const r = await tgApi(tok, 'sendMessage', body);
  if (!r?.ok) console.error('tgSend:', r?.description);
  return r;
}

// Факты для ответов клиенту — только публичные и проверенные, как у черновиков.
export async function publicFacts(sb: Sb): Promise<Fact[]> {
  const { data } = await sb.from('knowledge').select('id,title,body,access,status')
    .eq('access', 'Публичное').in('status', TRUSTED_STATUS).limit(40);
  return (data ?? []).map((r: any) => ({ id: r.id, title: r.title, body: String(r.body).slice(0, 1200) }));
}

const PROVIDER = (Deno.env.get('AI_PROVIDER') || 'gemini') as Provider;
const DEFAULT_MODEL: Record<string, string> = { gemini: 'gemini-3.5-flash', yandex: 'yandexgpt/latest', openai: 'deepseek-chat' };
const MODEL = Deno.env.get('AI_MODEL') || Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL[PROVIDER] || 'deepseek-chat';
const FALLBACK = Deno.env.get('AI_FALLBACK_MODEL') ?? (PROVIDER === 'gemini' ? 'gemini-3.5-flash-lite' : PROVIDER === 'yandex' ? 'yandexgpt-lite/latest' : '');
const AI_KEY = Deno.env.get('AI_API_KEY') || Deno.env.get('GEMINI_API_KEY') || '';
const AI_BASE = Deno.env.get('AI_BASE_URL') || '';
const FOLDER = Deno.env.get('YANDEX_FOLDER_ID') || '';
// Бот отвечает незнакомым людям — у расхода свой потолок, отдельно от людей.
export const BOT_DAILY_LIMIT = 200;

export async function botAiAllowed(sb: Sb, actor: string): Promise<boolean> {
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await sb.from('ai_usage').select('*', { count: 'exact', head: true }).eq('actor', actor).gte('at', since);
  return (count ?? 0) < BOT_DAILY_LIMIT;
}

export async function aiText(sb: Sb, prompt: string, actor: string): Promise<string> {
  if (!AI_KEY) return '';
  for (const [i, model] of modelAttempts(MODEL, FALLBACK).entries()) {
    try {
      const req = providerRequest(PROVIDER, model, AI_KEY, AI_BASE, prompt, FOLDER);
      // ответ клиенту — обычный текст, не JSON
      if (PROVIDER === 'gemini') delete (req.body as any).generationConfig.responseMimeType;
      if (PROVIDER === 'openai') delete (req.body as any).response_format;
      const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: AbortSignal.timeout(25_000) });
      if (res.ok) {
        const text = providerText(PROVIDER, await res.json());
        await sb.from('ai_usage').insert({ actor, model: `${PROVIDER}/${model}`, drafts: 0, chars: text.length });
        return text;
      }
      console.error('aiText:', model, res.status);
      if (!RETRY_STATUS.includes(res.status)) return '';
      if (i === 0) await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      console.error('aiText:', e);
    }
  }
  return '';
}

export const AI_IS_GEMINI = PROVIDER === 'gemini' && !!AI_KEY;

// Голосовое → текст. Умеет только Gemini; у других провайдеров просим написать.
export async function transcribe(tok: string, fileId: string): Promise<string> {
  if (!AI_IS_GEMINI) return '';
  const f = await tgApi(tok, 'getFile', { file_id: fileId }).catch(() => null);
  const path = f?.result?.file_path;
  if (!path || Number(f?.result?.file_size ?? 0) > 8_000_000) return '';
  return transcribeUrl(`https://api.telegram.org/file/bot${tok}/${path}`);
}

// Голосовое ВКонтакте приходит ссылкой на файл. Скачиваем только с серверов
// Telegram и ВКонтакте — чужой адрес сюда попасть не должен.
const AUDIO_HOSTS = /^https:\/\/([\w-]+\.)*(telegram\.org|userapi\.com|vkuseraudio\.net|vkuser\.net|vk\.com|vk\.me)\//;
export async function transcribeUrl(url: string): Promise<string> {
  if (!AI_IS_GEMINI || !AUDIO_HOSTS.test(url)) return '';
  try {
    const dl = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!dl.ok) return '';
    const bytes = new Uint8Array(await dl.arrayBuffer());
    if (bytes.length > 8_000_000) return '';
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const base = AI_BASE || 'https://generativelanguage.googleapis.com/v1beta';
    const res = await fetch(`${base}/models/${MODEL}:generateContent?key=${encodeURIComponent(AI_KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ contents: [{ parts: [
        { inlineData: { mimeType: /\.mp3(\?|$)/.test(url) ? 'audio/mpeg' : 'audio/ogg', data: btoa(bin) } },
        { text: 'Точно транскрибируй голосовое сообщение на русском. Только текст, без пояснений и кавычек.' }
      ] }], generationConfig: { temperature: 0 } })
    });
    const d = await res.json();
    return String(d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().slice(0, 2000);
  } catch { return ''; }
}

// Сравнение секретов без утечки по времени.
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// «Сегодня» по пермскому времени (UTC+5): ночная заявка не должна стать вчерашней.
export const permToday = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);

// Всё, что нужно разговору бота: ИИ с дневным потолком, факты базы знаний,
// уведомление менеджеру. Уведомления идут в Telegram с любого канала.
export function botDeps(sb: Sb, actor: string, cfg: Record<string, any>, tgTok: string): Deps {
  return {
    sb,
    ai: prompt => aiText(sb, prompt, actor),
    aiAllowed: () => botAiAllowed(sb, actor),
    facts: () => publicFacts(sb),
    notify: async text => { if (tgTok && cfg.manager_chat_id) await tgSend(tgTok, Number(cfg.manager_chat_id), text); },
    today: permToday
  };
}

export function telegramChannel(tok: string): Channel {
  return {
    name: 'Telegram', key: 'tg_chat_id', source: 'Telegram-бот',
    send: async (id, text, kb) => {
      const r = await tgSend(tok, Number(id), text, kb);
      return r?.ok ? String(r.result?.message_id ?? '') : null;
    }
  };
}

// ---------------------------------------------------------------- ВКонтакте
export const VK_V = '5.199';

export async function vkApi(tok: string, method: string, params: Record<string, string | number>): Promise<any> {
  const body = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), access_token: tok, v: VK_V });
  const res = await fetch(`https://api.vk.com/method/${method}`, { method: 'POST', body, signal: AbortSignal.timeout(15_000) });
  return res.json().catch(() => ({ error: { error_msg: `HTTP ${res.status}` } }));
}

export function vkChannel(tok: string): Channel {
  return {
    name: 'ВКонтакте', key: 'vk_peer_id', source: 'ВКонтакте-бот',
    send: async (id, text, kb) => {
      const params: Record<string, string | number> = {
        peer_id: Number(id), message: text.slice(0, 4096), random_id: crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647
      };
      const k = vkKeyboard(kb);
      if (k) params.keyboard = k;
      let r = await vkApi(tok, 'messages.send', params);
      // Кнопки бота выключены в настройках сообщества — то же сообщение без
      // них, а варианты ответа текстом: письмо должно дойти в любом случае.
      if (r?.error && k && [911, 912].includes(Number(r.error.error_code))) {
        delete params.keyboard;
        params.message = [text, keyboardAsText(kb)].filter(Boolean).join('\n\n').slice(0, 4096);
        params.random_id = crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647;
        r = await vkApi(tok, 'messages.send', params);
      }
      if (r?.error) { console.error('vk send:', r.error.error_code, r.error.error_msg); return null; }
      return String(r?.response ?? '');
    },
    past: async id => {
      const r = await vkApi(tok, 'messages.getHistory', { peer_id: Number(id), count: 21 });
      return (r?.response?.items ?? []).map((m: any) => ({
        in: Number(m.from_id) > 0, text: String(m.text ?? '').slice(0, 4000),
        at: new Date(Number(m.date) * 1000).toISOString(), id: String(m.id ?? '')
      }));
    },
    profile: async id => {
      const r = await vkApi(tok, 'users.get', { user_ids: Number(id) });
      const u = r?.response?.[0];
      return u ? { name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(), link: `https://vk.com/id${id}` } : null;
    }
  };
}
