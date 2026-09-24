// Подготовка публикации и разбор ответа канала.
// Здесь нет обращений к сети и к базе — эту часть проверяют тесты.

export const TELEGRAM_LIMIT = 4096;
export const PUBLISHABLE_STATUS = 'Утверждено';

export type Post = { id: string; title: string; body: string; status: string; channel: string };

const escapeHtml = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Почему так строго: публикация необратима. Пропускаем только то, что
// человек сознательно утвердил, и только один раз в канал.
export function checkPublishable(post: Post | null, alreadySent: number, channel: string): void {
  if (!post) throw new Error('Публикация не найдена');
  if (post.status !== PUBLISHABLE_STATUS) {
    throw new Error(`Публикуются только материалы со статусом «${PUBLISHABLE_STATUS}». Сейчас статус: «${post.status}».`);
  }
  if (alreadySent > 0) throw new Error(`Этот материал уже отправлен в ${channel}. Повторная отправка отключена.`);
  if (!post.body.trim()) throw new Error('Пустой текст публиковать нельзя');
}

export function buildMessage(post: Post): { text: string; parse_mode: string } {
  const title = post.title.trim();
  const body = post.body.trim();
  // Заголовок в Threads и Telegram — рабочее название, в текст его выносим
  // только если он не повторяет первую строку.
  const firstLine = body.split('\n')[0].trim();
  const head = title && title !== firstLine ? `<b>${escapeHtml(title)}</b>\n\n` : '';
  const text = head + escapeHtml(body);
  if (text.length > TELEGRAM_LIMIT) {
    throw new Error(`Текст длиннее ${TELEGRAM_LIMIT} знаков (${text.length}). Сократите или разбейте на части.`);
  }
  return { text, parse_mode: 'HTML' };
}

// Телеграм отвечает кодами, которые человеку ничего не говорят.
export function telegramError(status: number, payload: any): string {
  const raw = String(payload?.description || '');
  if (/chat not found/i.test(raw)) return 'Канал не найден. Проверьте идентификатор канала в настройках проекта.';
  if (/bot is not a member|not enough rights|CHAT_ADMIN_REQUIRED/i.test(raw)) {
    return 'Бот не может писать в канал. Добавьте его администратором с правом публикации.';
  }
  if (/bot was blocked|bot was kicked/i.test(raw)) return 'Бота удалили из канала. Верните его администратором.';
  if (/unauthorized/i.test(raw) || status === 401) return 'Неверный токен бота. Проверьте секрет TELEGRAM_BOT_TOKEN.';
  if (status === 429) return 'Слишком часто. Подождите минуту и повторите.';
  return `Телеграм ответил ошибкой ${status}${raw ? ': ' + raw : ''}`;
}

// Ссылка собирается, только если канал публичный: у приватных её нет.
export function messageUrl(result: any): string {
  const name = result?.chat?.username;
  const id = result?.message_id;
  return name && id ? `https://t.me/${name}/${id}` : '';
}
