// Голосовые сводки для Telegram: текст пишет модель (Claude, если подключён ключ
// разбора ТЗ, иначе Gemini), читает Gemini TTS, в чат уходит MP3 — Telegram
// показывает его плеером прямо в сообщении. Тот же голос и подача, что у кнопки
// «Голосовая сводка» в приложении.

import { Mp3Encoder } from 'https://esm.sh/@breezystack/lamejs@1.2.7';
import {
  voiceContext, buildVoicePrompt, buildDigestVoicePrompt, parseVoice, ttsRequest, pickTtsModel, pcmOf
} from '../ai-write/compose.ts';
import { askModel } from './brief-ai.ts';
import type { Sb } from './outreach.ts';

const PROVIDER = Deno.env.get('AI_PROVIDER') || 'gemini';
const KEY = Deno.env.get('VOICE_AI_KEY') || (PROVIDER === 'gemini' ? Deno.env.get('AI_API_KEY') : '') || Deno.env.get('GEMINI_API_KEY') || '';
const VOICE = Deno.env.get('VOICE_TTS_VOICE') || 'Kore';
let ttsModel = Deno.env.get('VOICE_TTS_MODEL') || '';

export const voiceReady = () => !!KEY;

async function speak(script: string): Promise<{ pcm: Uint8Array; rate: number }> {
  if (!ttsModel) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': KEY } });
    const names = r.ok ? ((await r.json()).models || []).filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m: any) => String(m.name).split('/').pop()) : [];
    ttsModel = pickTtsModel(names);
    if (!ttsModel) throw new Error('ключ Gemini не видит моделей озвучки');
  }
  for (let i = 0; i < 3; i++) {
    const q = ttsRequest(ttsModel, KEY, '', script, VOICE);
    const resp = await fetch(q.url, { method: 'POST', headers: q.headers, body: JSON.stringify(q.body), signal: AbortSignal.timeout(110_000) });
    if (resp.ok) {
      const part = (await resp.json())?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData)?.inlineData;
      if (!part?.data) throw new Error('озвучка вернула пустой ответ');
      return pcmOf(Uint8Array.from(atob(part.data), c => c.charCodeAt(0)), part.mimeType || '');
    }
    if (![429, 500, 503].includes(resp.status)) throw new Error(`озвучка: ошибка ${resp.status}`);
    await new Promise(res => setTimeout(res, 4000 * (i + 1)));
  }
  throw new Error('озвучка перегружена');
}

function mp3(pcm: Uint8Array, rate: number): Uint8Array {
  const samples = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + (pcm.byteLength & ~1)));
  const enc = new Mp3Encoder(1, rate, 64), parts: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += 1152) { const b = enc.encodeBuffer(samples.subarray(i, i + 1152)); if (b.length) parts.push(new Uint8Array(b)); }
  parts.push(new Uint8Array(enc.flush()));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function voiceOf(sb: Sb, prompt: string, actor: string) {
  const text = parseVoice(await askModel(sb, prompt, actor));
  const { pcm, rate } = await speak(text);
  return { text, audio: mp3(pcm, rate) };
}

// Сводка по клиенту: бриф и его заявка из базы.
export async function clientVoice(sb: Sb, briefId: string) {
  const { data: brief } = await sb.from('briefs').select('*').eq('id', briefId).maybeSingle();
  if (!brief) throw new Error('бриф не найден');
  const { data: lead } = brief.lead_id ? await sb.from('leads').select('*').eq('id', brief.lead_id).maybeSingle() : { data: null };
  return voiceOf(sb, buildVoicePrompt(voiceContext(brief, lead)), 'voice-kp');
}

// Утренняя сводка голосом — пересказ текста дайджеста.
export const digestVoice = (sb: Sb, digest: string) => voiceOf(sb, buildDigestVoicePrompt(digest), 'voice-digest');

// MP3 в чат: sendAudio показывает плеер с названием. Голос подписываем текстом —
// его можно прочитать, если слушать неудобно.
export async function sendAudio(token: string, chatId: number, audio: Uint8Array, title: string, caption = '') {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('title', title.slice(0, 64));
  form.append('performer', 'Hub ADERVIS');
  if (caption) form.append('caption', caption.slice(0, 1024));
  form.append('audio', new Blob([audio], { type: 'audio/mpeg' }), 'svodka.mp3');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
  return res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
}
