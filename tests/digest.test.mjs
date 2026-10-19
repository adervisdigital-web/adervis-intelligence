// Утренняя сводка: те же правила, что «На сегодня» в приложении.
import { digestItems, digestText, permNow } from '../supabase/functions/_shared/digest.ts';

let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  -> ' + extra : '')); };

const now = Date.parse('2026-10-20T04:00:00Z'); // 9:00 в Перми
const base = { today: '2026-10-20', now, leads: [], prospects: [], briefs: [], campaigns: [], content: [], newLeads: 0, inbound: 0, appUrl: 'https://app' };

const d = {
  ...base, newLeads: 2, inbound: 7,
  leads: [
    { name: 'Уралхим', status: 'В работе', next_on: '2026-10-19', next_step: 'Вопросы по ТЗ' },
    { name: 'Кофейня', status: 'Новое', came_on: '2026-10-18', next_on: null },
    { name: 'Завод', status: 'КП отправлено', next_on: null, updated_at: '2026-10-15T10:00:00Z' },
    { name: 'Сделка', status: 'Сделка', next_on: '2026-10-01' },
    { name: 'Завтра', status: 'В работе', next_on: '2026-10-21' }
  ],
  prospects: [
    { name: 'Анастасия', status: 'Ответили', vk_peer_id: 1, bot_mode: 'human', last_direction: 'in', last_text: 'Когда будет КП?', last_message_at: '2026-10-19T12:00:00Z' },
    { name: 'Бот ведёт', status: 'Ответили', tg_chat_id: 2, bot_mode: 'bot', last_direction: 'in', last_message_at: '2026-10-19T12:00:00Z' },
    { name: 'Клиника', status: 'Написали', next_on: '2026-10-20' }
  ],
  briefs: [{ title: 'Видеодайджест', stage: 'Вопросы', next_on: '2026-10-20', next_step: 'Отправить вопросы' }, { title: 'Закрыт', stage: 'Сделка', next_on: '2026-10-01' }],
  campaigns: [{ name: 'ВК осень', status: 'Идёт', ends_on: '2026-10-21' }],
  content: [{ title: 'Пост про Stock', status: 'Готово', publish_on: '2026-10-20', channel: 'Telegram' }]
};
const items = digestItems(d);
check('в сводку попадает то же, что в «На сегодня»', items.length === 8, items.map(x => x.title).join(', '));
check('закрытые заявки, брифы и будущие шаги — не попадают', !items.some(x => ['Сделка', 'Закрыт', 'Завтра'].includes(x.title)));
check('диалог, где отвечает бот, — не дело', !items.some(x => x.title === 'Бот ведёт'));
check('просроченное — первым', items[0].late && items.findIndex(x => !x.late) > items.findLastIndex(x => x.late));
check('КП без ответа 4 дня — напомнить', items.some(x => x.title === 'Завод' && x.what.includes('4 дня')));
const text = digestText(d);
check('текст: дата, счёт дел, разделы', text.startsWith('☀️ На сегодня, 20 октября: 8 дел, просрочено 4') && text.includes('🔴 Просрочено') && text.includes('📌 Сегодня'), text.split('\n')[0]);
check('текст: итоги суток и ссылка', text.includes('2 новые заявки, 7 сообщений от клиентов') && text.trim().endsWith('https://app'));
check('пустой день — подсказка', digestText(base).includes('срочного нет') && digestText(base).includes('Поиска клиентов'));
const many = digestText({ ...base, leads: Array.from({ length: 20 }, (_, i) => ({ name: 'Л' + i, status: 'В работе', next_on: '2026-10-20' })) });
check('больше 12 дел — остальные «в приложении»', many.includes('…и ещё 8'));
const away = digestItems({ ...base, prospects: [{ name: 'В личке', status: 'Ответили', vk_peer_id: 3, bot_mode: 'human', elsewhere: 'ВК, личная страница', last_direction: 'in', last_message_at: '2026-10-18T12:00:00Z' }] });
check('ушёл в личную переписку — не «ждёт ответа» и не просрочено', away.length === 0);
check('пермский час', permNow(now).hour === 9 && permNow(Date.parse('2026-10-20T20:30:00Z')).date === '2026-10-21');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
