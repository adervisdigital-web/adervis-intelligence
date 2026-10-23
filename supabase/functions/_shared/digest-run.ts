// Сборка утренней сводки из базы и отправка служебным ботом @adervis_intel_bot.

import { tgApi, type Sb } from './outreach.ts';
import { digestText, permNow } from './digest.ts';

// Ключ служебного бота — секрет проекта; им же функция publish пишет в канал.
export const INTEL_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
export const APP_URL = 'https://hub.adervis.ru/';

export async function buildDigest(sb: Sb): Promise<string> {
  const now = Date.now(), { date } = permNow(now);
  const yesterday = new Date(Date.parse(date) - 864e5).toISOString().slice(0, 10);
  const rows = (r: any) => r?.data ?? [];
  const [leads, prospects, briefs, campaigns, content, fresh, inbound, kp] = await Promise.all([
    sb.from('leads').select('name,status,next_on,next_step,came_on,updated_at').in('status', ['Новое', 'В работе', 'КП отправлено']),
    sb.from('prospects').select('name,status,next_on,updated_at,tg_chat_id,vk_peer_id,ig_user_id,bot_mode,elsewhere,last_direction,last_text,last_message_at'),
    sb.from('briefs').select('title,stage,next_on,next_step').lte('next_on', date),
    sb.from('campaigns').select('name,status,ends_on').eq('status', 'Идёт'),
    sb.from('content').select('title,status,publish_on,channel').lte('publish_on', date).neq('status', 'Опубликовано'),
    sb.from('leads').select('*', { count: 'exact', head: true }).eq('came_on', yesterday),
    sb.from('messages').select('*', { count: 'exact', head: true }).eq('direction', 'in').gte('created_at', new Date(now - 864e5).toISOString()),
    sb.from('kp_shares').select('views,last_view_at,choice,chosen_at,created_at,title:data->>title,client:data->>client')
  ]);
  return digestText({
    today: date, now, leads: rows(leads), prospects: rows(prospects), briefs: rows(briefs), campaigns: rows(campaigns),
    content: rows(content), newLeads: fresh?.count ?? 0, inbound: inbound?.count ?? 0, kp: rows(kp), appUrl: APP_URL
  });
}

export async function sendDigest(chatId: number, text: string) {
  return tgApi(INTEL_TOKEN, 'sendMessage', { chat_id: chatId, text, link_preview_options: { is_disabled: true } });
}
