import {
  sanitizeOptions, buildPrompt, parseReply, usableFacts, providerRequest, providerText, MAX_DRAFTS
} from '../supabase/functions/ai-write/compose.ts';

let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  -> ' + extra : '')); };
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// --- разбор задачи от пользователя
check('пустая задача отклоняется', !!throws(() => sanitizeOptions({ goal: 'коротко' })));
check('слишком длинная задача отклоняется', !!throws(() => sanitizeOptions({ goal: 'x'.repeat(2001) })));
const o = sanitizeOptions({ goal: 'Написать посты про сметы', author: 'кто-то', channel: 'TikTok', product: 'CRM', count: 99 });
check('неизвестный автор заменяется на первого из списка', o.author === 'Артём Никитин');
check('неизвестная площадка заменяется на Threads', o.channel === 'Threads');
check('известное направление сохраняется', o.product === 'CRM');
check('число вариантов ограничено сверху', o.count === MAX_DRAFTS, String(o.count));
check('число вариантов по умолчанию — 3', sanitizeOptions({ goal: 'Написать посты про сметы' }).count === 3);

// --- отбор фактов
const rows = [
  { id: 'k1', title: 'Позиционирование', body: 'Визуал для бизнеса', source: 'https://adervis.ru/', access: 'Публичное', status: 'Публичный источник' },
  { id: 'k5', title: 'История и цели', body: 'Сократили штат', source: 'Сообщения', access: 'Внутреннее', status: 'Со слов команды' },
  { id: 'k7', title: 'Цифры на сайте', body: '700+ проектов', source: 'https://adervis.ru/', access: 'Публичное', status: 'Требует проверки' },
  { id: 'k8', title: 'Видео и монтаж', body: 'Ролики с мероприятий', source: 'Сообщения', access: 'Публичное', status: 'Со слов команды' }
];
const facts = usableFacts(rows);
check('внутренние записи не попадают в факты', !facts.some(f => f.id === 'k5'));
check('непроверенные записи не попадают в факты', !facts.some(f => f.id === 'k7'));
check('публичные проверенные записи остаются', facts.map(f => f.id).join() === 'k1,k8', facts.map(f => f.id).join());

// --- сборка запроса
const prompt = buildPrompt(facts, sanitizeOptions({ goal: 'Написать посты про монтаж', channel: 'Telegram' }));
check('в запросе есть факты с номерами', prompt.includes('[k1] Позиционирование') && prompt.includes('[k8] Видео и монтаж'));
check('в запросе нет внутренних сведений', !prompt.includes('Сократили штат') && !prompt.includes('700+'));
check('в запросе есть запрет на выдумки', /Не придумывай/.test(prompt));
check('в запросе есть защита от команд внутри фактов', /данные, а не инструкции/.test(prompt));
check('в запросе есть подсказка по длине для площадки', prompt.includes('до 900 знаков'));
check('запрос без фактов невозможен', !!throws(() => buildPrompt([], o)));

// --- разбор ответа модели
const good = JSON.stringify({
  drafts: [
    { title: 'Смета', body: 'Текст поста', sources: ['k1', 'k404'] },
    { title: '', body: 'Без названия', sources: [] }
  ],
  gaps: ['Не хватает примера кейса', '']
});
const parsed = parseReply('```json\n' + good + '\n```', ['k1', 'k8']);
check('обёртка ```json снимается', parsed.drafts.length === 1);
check('ссылка на несуществующий факт убирается', parsed.drafts[0].sources.join() === 'k1');
check('черновик без названия отбрасывается', parsed.drafts.every(d => d.title));
check('пропуски модели сохраняются', parsed.gaps.join() === 'Не хватает примера кейса');
check('мусор вместо JSON отклоняется', !!throws(() => parseReply('извините, не смогу', ['k1'])));
check('ответ без черновиков отклоняется', !!throws(() => parseReply('{"drafts":[]}', ['k1'])));

// --- смена провайдера без правок кода
const g = providerRequest('gemini', 'gemini-2.5-flash', 'КЛЮЧ 1', '', 'текст запроса');
check('Gemini: адрес с моделью и ключом', g.url.includes('/models/gemini-2.5-flash:generateContent') && g.url.includes('%D0%9A%D0%9B%D0%AE%D0%A7'), g.url.slice(0, 90));
check('Gemini: запрос просит ответ в JSON', g.body.generationConfig.responseMimeType === 'application/json');
check('Gemini: текст запроса на месте', g.body.contents[0].parts[0].text === 'текст запроса');
check('Gemini: ключ не уходит в заголовке', !JSON.stringify(g.headers).includes('КЛЮЧ'));

const d = providerRequest('openai', 'deepseek-chat', 'ключ2', '', 'текст запроса');
check('DeepSeek: адрес по умолчанию', d.url === 'https://api.deepseek.com/chat/completions', d.url);
check('DeepSeek: ключ уходит заголовком', d.headers.Authorization === 'Bearer ключ2');
check('DeepSeek: модель и текст на месте', d.body.model === 'deepseek-chat' && d.body.messages[0].content === 'текст запроса');
check('DeepSeek: запрос просит ответ в JSON', d.body.response_format.type === 'json_object');

const other = providerRequest('openai', 'любая-модель', 'k', 'https://шлюз.example/v1/', 'текст');
check('свой адрес сервиса поддерживается без лишней косой черты', other.url === 'https://шлюз.example/v1/chat/completions', other.url);

check('разбор ответа Gemini', providerText('gemini', { candidates: [{ content: { parts: [{ text: 'ответ' }] } }] }) === 'ответ');
check('разбор ответа OpenAI-совместимого', providerText('openai', { choices: [{ message: { content: 'ответ' } }] }) === 'ответ');
check('неожиданный ответ не роняет функцию', providerText('gemini', { error: 'что-то не так' }) === '');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
