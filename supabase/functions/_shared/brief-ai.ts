// Разбор ТЗ и чтение голосовых/PDF на сервере — для бота приёма заявок.
// Та же сборка запроса и разбор ответа, что у функции ai-write: модель
// одинаково раскладывает ТЗ из приложения и из Telegram.

import {
  sanitizeBriefTask, buildBriefPrompt, parseBrief, usableFacts, providerRequest, providerText, TRUSTED_STATUS, TRANSCRIBE_PROMPT, type Provider
} from '../ai-write/compose.ts';
import type { Sb } from './outreach.ts';

const PROVIDER = (Deno.env.get('AI_PROVIDER') || 'gemini') as Provider;
const DEFAULT_MODEL: Record<string, string> = { gemini: 'gemini-3.5-flash', yandex: 'yandexgpt/latest', openai: 'deepseek-chat' };
const MODEL = Deno.env.get('AI_MODEL') || Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL[PROVIDER] || 'deepseek-chat';
const AI_KEY = Deno.env.get('AI_API_KEY') || Deno.env.get('GEMINI_API_KEY') || '';
const AI_BASE = Deno.env.get('AI_BASE_URL') || '';
const FOLDER = Deno.env.get('YANDEX_FOLDER_ID') || '';
// ТЗ разбирает Claude, когда подключён ключ — так решили владельцы.
const BRIEF_KEY = Deno.env.get('BRIEF_AI_KEY') || Deno.env.get('ANTHROPIC_API_KEY') || '';
const BRIEF_PROVIDER = (Deno.env.get('BRIEF_AI_PROVIDER') || 'anthropic') as Provider;
const BRIEF_MODEL = Deno.env.get('BRIEF_AI_MODEL') || 'claude-opus-5-5';
const BRIEF_BASE = Deno.env.get('BRIEF_AI_BASE_URL') || '';

export async function analyzeBrief(sb: Sb, text: string, client: string) {
  const { data: rates } = await sb.from('studio_rates').select('id,name,rate').order('sort');
  // «Расходы» — не работа людей: модель часы на них не раскладывает
  const roles = (rates ?? []).filter((r: any) => r.id !== 'cost').map((r: any) => ({ id: r.id, name: r.name }));
  const task = sanitizeBriefTask({ text, client, roles });
  const { data: rows } = await sb.from('knowledge').select('id,title,body,source,access,status').eq('access', 'Публичное').in('status', TRUSTED_STATUS);
  const prompt = buildBriefPrompt(task, usableFacts(rows ?? []));
  const claude = !!BRIEF_KEY, provider = claude ? BRIEF_PROVIDER : PROVIDER, model = claude ? BRIEF_MODEL : MODEL;
  const req = claude ? providerRequest(BRIEF_PROVIDER, BRIEF_MODEL, BRIEF_KEY, BRIEF_BASE, prompt) : providerRequest(PROVIDER, MODEL, AI_KEY, AI_BASE, prompt, FOLDER);
  const resp = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: AbortSignal.timeout(170_000) });
  if (!resp.ok) throw new Error(resp.status === 429 || resp.status === 503 ? 'модель перегружена — нажмите «Разобрать» ещё раз через минуту' : `модель ответила ошибкой ${resp.status}`);
  const out = providerText(provider, await resp.json());
  const parsed = parseBrief(out, task);
  await sb.from('ai_usage').insert({ actor: 'intel-bot', model: `${provider}/${model}`, drafts: 0, chars: out.length });
  return { ...parsed, model: claude ? `Claude (${model})` : model, rates: rates ?? [] };
}

// Голосовое или PDF → текст: Gemini принимает файл прямо в запросе.
const PDF_PROMPT = 'Перепиши текст документа как есть, по-русски, сохранив порядок, списки и таблицы (ячейки через « | »). Без пояснений.';
export async function readWithAi(bytes: Uint8Array, mime: string): Promise<string> {
  if (PROVIDER !== 'gemini' || !AI_KEY) throw new Error('голос и PDF читает Gemini, а он сейчас не подключён');
  if (bytes.length > 8_000_000) throw new Error('файл больше 8 МБ');
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const base = AI_BASE || 'https://generativelanguage.googleapis.com/v1beta';
  const resp = await fetch(`${base}/models/${MODEL}:generateContent?key=${encodeURIComponent(AI_KEY)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: btoa(bin) } }, { text: mime === 'application/pdf' ? PDF_PROMPT : TRANSCRIBE_PROMPT }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8192 } })
  });
  if (!resp.ok) throw new Error(`не прочиталось (ошибка ${resp.status})`);
  const text = providerText('gemini', await resp.json()).trim();
  if (!text) throw new Error(mime.startsWith('audio') ? 'в записи не нашлось речи' : 'в файле не нашлось текста');
  return text;
}
