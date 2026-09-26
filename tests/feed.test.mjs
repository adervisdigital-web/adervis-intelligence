import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseViews, parseTelegram, parseYouTube, parseVk, cleanHandle, feedUrl, htmlToText, parseFeed
} from '../supabase/functions/feed/compose.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = name => fs.readFileSync(path.join(HERE, 'fixtures', name), 'utf8');

let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  -> ' + extra : '')); };
const throws = fn => { try { fn(); return null; } catch (e) { return e.message; } };

// --- просмотры в телеграме пишутся сокращённо
check('обычное число', parseViews('47') === 47);
check('тысячи с точкой', parseViews('1.2K') === 1200);
check('тысячи с запятой', parseViews('3,4K') === 3400);
check('миллионы', parseViews('1.5M') === 1500000);
check('мусор — не ноль, а «неизвестно»', parseViews('views') === null && parseViews(undefined) === null);

// --- текст поста
check('переносы строк сохраняются, теги убираются',
  htmlToText('Первая<br/><br/><b>вторая</b> &amp; &laquo;третья&raquo;') === 'Первая\n\nвторая & «третья»');

// --- Telegram: настоящая страница t.me/s/Adervis_digital (три поста)
const tg = parseTelegram(fixture('telegram.html'), 'Adervis_digital');
check('все посты найдены', tg.length === 3, String(tg.length));
check('новые сверху', tg[0].id === '64' && tg[2].id === '45', tg.map(p => p.id).join(','));
check('ссылка на пост собрана', tg[0].url === 'https://t.me/Adervis_digital/64', tg[0].url);
check('дата взята из поста, а не из длительности видео', tg[0].date === '2026-03-06T09:45:09+00:00', tg[0].date);
check('просмотры числом', tg[0].views === 47, String(tg[0].views));
const robots = tg.find(p => p.id === '45');
check('текст поста разобран', robots && robots.text.startsWith('Сделали отчетное видео с полуфинала'), robots && robots.text.slice(0, 60));
check('заголовок — первая строка текста', robots && robots.title.startsWith('Сделали отчетное видео'), robots && robots.title);
check('в тексте нет тегов', tg.every(p => !/<[a-z]/i.test(p.text)));
check('у каждого поста есть заголовок', tg.every(p => p.title.length > 0));

// --- YouTube: настоящий RSS канала (два ролика)
const yt = parseYouTube(fixture('youtube.xml'));
check('ролики найдены', yt.length === 2, String(yt.length));
check('название ролика', yt[0].title === 'Лукойл - SAFETY MAN', yt[0].title);
check('ссылка на ролик', yt[0].url === 'https://www.youtube.com/watch?v=43IioSJSkdA', yt[0].url);
check('дата публикации, а не обновления', yt[0].date === '2026-06-24T12:30:17+00:00', yt[0].date);
check('просмотры из статистики', yt[0].views === 5, String(yt[0].views));

// --- ВКонтакте: ответ wall.get
const vk = parseVk({ response: { items: [
  { id: 12, owner_id: -123, date: 1790000000, text: 'Сняли ролик\n\nПодробнее внутри', views: { count: 340 }, comments: { count: 2 } },
  { id: 11, owner_id: -123, date: 1789000000, text: '' }
] } });
check('пост ВК со ссылкой на стену', vk[0].url === 'https://vk.com/wall-123_12', vk[0].url);
check('просмотры и комментарии ВК', vk[0].views === 340 && vk[0].replies === 2);
check('дата ВК из секунд', vk[0].date.startsWith('2026-09-21'), vk[0].date);
check('пост без текста не теряется', vk[1].title === 'Пост без текста' && vk[1].views === null);
check('неверный ключ ВК объясняется', /VK_SERVICE_TOKEN/.test(throws(() => parseVk({ error: { error_code: 5, error_msg: 'User authorization failed' } })) || ''));
check('закрытая стена объясняется', /закрыта/.test(throws(() => parseVk({ error: { error_code: 15 } })) || ''));

// --- адрес канала вписывают как угодно
check('ссылка t.me превращается в имя', cleanHandle('Telegram', 'https://t.me/Adervis_digital') === 'Adervis_digital');
check('@имя тоже подходит', cleanHandle('Telegram', '@Adervis_digital') === 'Adervis_digital');
check('ссылка vk.com превращается в имя', cleanHandle('ВКонтакте', 'https://vk.com/adervis_digital?w=wall') === 'adervis_digital');
check('номер канала YouTube из ссылки', cleanHandle('YouTube', 'https://www.youtube.com/channel/UCwL-PkN9Jul92VJm5gFgY-Q') === 'UCwL-PkN9Jul92VJm5gFgY-Q');
check('ник YouTube вместо номера отклоняется с подсказкой', /UC…/.test(throws(() => cleanHandle('YouTube', '@adervis')) || ''));
check('чужой сайт вместо канала отклоняется', throws(() => cleanHandle('Telegram', 'evil.com/../x y')) !== null);
check('пробелы и спецсимволы в имени отклоняются', throws(() => cleanHandle('ВКонтакте', 'a b&c')) !== null);

// --- куда идёт запрос
check('Telegram читается с публичной страницы', feedUrl('Telegram', 'Adervis_digital') === 'https://t.me/s/Adervis_digital');
check('YouTube — через RSS', feedUrl('YouTube', 'UCwL-PkN9Jul92VJm5gFgY-Q').includes('feeds/videos.xml?channel_id=UCwL'));
check('ВК без ключа — понятная ошибка', /VK_SERVICE_TOKEN/.test(throws(() => feedUrl('ВКонтакте', 'adervis_digital')) || ''));
check('ключ ВК уходит в запрос', feedUrl('ВКонтакте', 'adervis_digital', 'tok').includes('access_token=tok'));
check('незнакомая площадка отклоняется', /не читает/.test(throws(() => feedUrl('Дзен', 'x')) || ''));
check('разбор по названию площадки', parseFeed('YouTube', fixture('youtube.xml'), 'UCwL-PkN9Jul92VJm5gFgY-Q').length === 2);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
