import {
  buildMessage, checkPublishable, messageUrl, telegramError, TELEGRAM_LIMIT
} from '../supabase/functions/publish/compose.ts';

let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  -> ' + extra : '')); };
const throws = fn => { try { fn(); return null; } catch (e) { return e.message; } };

const post = { id: 'p1', title: 'Смета не заканчивается на сумме', body: 'В смете легко посчитать камеру.\n\nА что забываете вы?', status: 'Утверждено', channel: 'Telegram' };

// --- что пускаем в канал
check('утверждённый материал публикуется', throws(() => checkPublishable(post, 0, 'Telegram')) === null);
check('черновик не публикуется',
  /Утверждено/.test(throws(() => checkPublishable({ ...post, status: 'Черновик' }, 0, 'Telegram')) || ''));
check('повторная отправка запрещена',
  /уже отправлен/.test(throws(() => checkPublishable(post, 1, 'Telegram')) || ''));
check('пустой текст не уходит',
  /Пустой/.test(throws(() => checkPublishable({ ...post, body: '   ' }, 0, 'Telegram')) || ''));
check('несуществующий материал отклоняется',
  /не найдена/.test(throws(() => checkPublishable(null, 0, 'Telegram')) || ''));

// --- сборка сообщения
const msg = buildMessage(post);
check('заголовок выделен жирным', msg.text.startsWith('<b>Смета не заканчивается на сумме</b>'));
check('текст идёт следом', msg.text.includes('В смете легко посчитать камеру.'));
check('разметка включена', msg.parse_mode === 'HTML');
check('заголовок не дублируется, если он же первая строка',
  !buildMessage({ ...post, body: 'Смета не заканчивается на сумме\n\nДальше текст' }).text.includes('<b>'));
check('угловые скобки в тексте экранируются',
  buildMessage({ ...post, body: 'Цена < 100 & > 50' }).text.includes('&lt; 100 &amp;'));
check('слишком длинный текст отклоняется с числом знаков',
  /длиннее 4096 знаков/.test(throws(() => buildMessage({ ...post, body: 'я'.repeat(TELEGRAM_LIMIT + 10) })) || ''));

// --- ответы телеграма по-человечески
check('канал не найден объясняется', /Канал не найден/.test(telegramError(400, { description: 'Bad Request: chat not found' })));
check('нет прав у бота объясняется', /администратором/.test(telegramError(400, { description: 'not enough rights' })));
check('неверный токен объясняется', /токен/.test(telegramError(401, { description: 'Unauthorized' })));
check('частые запросы объясняются', /Подождите/.test(telegramError(429, {})));
check('незнакомая ошибка показывается как есть', /500/.test(telegramError(500, { description: 'server error' })));

// --- ссылка на сообщение
check('ссылка собирается для публичного канала',
  messageUrl({ chat: { username: 'adervis' }, message_id: 42 }) === 'https://t.me/adervis/42');
check('для закрытого канала ссылки нет', messageUrl({ chat: {}, message_id: 42 }) === '');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
