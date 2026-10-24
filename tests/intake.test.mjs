// Приём заявок через служебного бота: что пришло, как читается, во что складывается.
import zlib from 'node:zlib';
import { choiceOf, budgetOf } from '../supabase/functions/_shared/kp-choice.ts';
import { sanitizeTrack, mergeTrack, engageLine } from '../supabase/functions/_shared/kp-engage.ts';
import { siteLeadOf, fingerprint, pageCheck, sitemapUrls, caseSlug } from '../supabase/functions/_shared/site.ts';
import { ANSWERS, WHO, WHO_PICK, guessBrief, briefKeyboard, pickBrief, buildAnswersPrompt, parseAnswers, applyAnswers, answersText } from '../supabase/functions/_shared/answers.ts';
import { senderOf, pieceOf, wordXmlText, docxText, compileSource, guessTitle, guessClient, applyBrief, estimateRange, summaryText, GO, CANCEL, KEYBOARD } from '../supabase/functions/_shared/intake.ts';

let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  -> ' + extra : '')); };

// кто автор пересланного
check('автор: пересланное от человека', senderOf({ forward_origin: { type: 'user', sender_user: { first_name: 'Олег', last_name: 'Петров' } } }) === 'Олег Петров');
check('автор: скрытый профиль, канал, старый формат', senderOf({ forward_origin: { type: 'hidden_user', sender_user_name: 'Паша' } }) === 'Паша'
  && senderOf({ forward_origin: { type: 'channel', chat: { title: 'Химпром' } } }) === 'Химпром' && senderOf({ forward_sender_name: 'Анастасия' }) === 'Анастасия');
{
  // выбор клиента в КП: сумму считает сервер по снимку, лишнее отбрасывает
  const data = { estimate: { two: true, base: 365000, full: 450000, options: [{ name: 'Звук', price: 20000 }, { name: 'LED', price: 20000 }] } };
  const c = choiceOf(data, { variant: 'base', options: [0, 0, 7, -1, 'x'], comment: '  созвон  в понедельник ' });
  check('КП, выбор: базовый + звук = 385 000, мусорные индексы отброшены', c.total === 385000 && c.options.length === 1 && c.label === 'Базовый вариант' && c.comment === 'созвон в понедельник');
  check('КП, бюджет: «300 000 ₽» → 300000, наша цена «от» базового; мусор и мелочь отклоняются', budgetOf(data, { amount: '300 000 ₽' })?.amount === 300000
    && budgetOf(data, { amount: '300 000' }).ours === 365000 && budgetOf(data, { amount: 'abc' }) === null && budgetOf(data, { amount: 500 }) === null);
  check('КП, выбор: без второго варианта всегда полный', choiceOf({ estimate: { two: false, full: 100000 } }, { variant: 'base' }).total === 100000);

  // как клиент читал КП: сигналы страницы складываются по визитам
  check('КП, чтение: мусор отбрасывается — чужие разделы, события, огромное время, кривой визит',
    sanitizeTrack({ visit: 'x' }) === null && JSON.stringify(sanitizeTrack({ visit: 'abc12345', sec: 99999, seen: ['Стоимость', '<script>'], events: ['pdf', 'hack'], variant: 'zzz' }))
      === JSON.stringify({ visit: 'abc12345', sec: 7200, seen: ['Стоимость'], played: false, ended: false, events: ['pdf'], variant: '' }));
  const t = (o) => sanitizeTrack({ visit: 'visit0001', ...o });
  let m = mergeTrack({}, t({ sec: 40, seen: ['Как видим оформление'] }), '2026-10-25T10:00:00Z');
  check('КП, чтение: первый сигнал — ещё не «горячий»', !m.hot && m.eng.total_sec === 40 && m.eng.visits.length === 1);
  m = mergeTrack(m.eng, t({ sec: 130, seen: ['Стоимость'], video: { played: true } }), '2026-10-25T10:02:00Z');
  check('КП, чтение: перевалили за 2 минуты — «горячий» визит, разделы копятся', m.hot && m.eng.seen.length === 2 && m.eng.played && !m.eng.ended);
  m = mergeTrack(m.eng, t({ sec: 100, events: ['xlsx'] }), '2026-10-25T10:03:00Z');
  check('КП, чтение: второй раз «горячим» не становится, время не уменьшается', !m.hot && m.eng.total_sec === 130 && m.eng.events[0] === 'xlsx');
  m = mergeTrack(m.eng, sanitizeTrack({ visit: 'visit0002', sec: 30, video: { ended: true } }), '2026-10-26T09:00:00Z');
  check('КП, чтение: новый визит суммируется, ролик досмотрен', m.eng.visits.length === 2 && m.eng.total_sec === 160 && m.eng.ended && m.eng.last_at === '2026-10-26T09:00:00Z');
  check('КП, чтение: одной строкой для Telegram и сводки', engageLine(m.eng) === 'читали 3 мин · дошли до сметы · ролик досмотрели · скачали смету' && engageLine({}) === '');
  let many = {};
  for (let i = 0; i < 25; i++) many = mergeTrack(many, sanitizeTrack({ visit: 'visit' + String(i).padStart(4, '0'), sec: 10 }), '2026-10-25T10:00:00Z').eng;
  check('КП, чтение: храним только последние 20 визитов', many.visits.length === 20 && many.visits[0].id === 'visit0005');
}
check('автор: своё сообщение — без автора', senderOf({ text: 'привет' }) === '');

// что пришло
check('голосовое — расшифровать', pieceOf({ voice: { file_id: 'v1', file_size: 1000 } }).kind === 'audio' && pieceOf({ voice: { file_id: 'v1' } }).mime === 'audio/ogg');
check('docx, pdf, m4a как файл — читаем, у каждого свой способ', pieceOf({ document: { file_id: 'd', file_name: 'ТЗ Ривьера.docx' } }).kind === 'docx'
  && pieceOf({ document: { file_id: 'p', file_name: 'Бриф.PDF' } }).kind === 'pdf' && pieceOf({ document: { file_id: 'a', file_name: 'запись.m4a' } }).mime === 'audio/mp4');
check('фото — берём подпись', pieceOf({ photo: [{}], caption: 'референс' }).kind === 'photo' && pieceOf({ photo: [{}], caption: 'референс' }).text === 'референс');
{
  const shot = pieceOf({ photo: [{ file_id: 'small', file_size: 900 }, { file_id: 'big', file_size: 90000 }] });
  check('скриншот — берём самый крупный размер, читаем как картинку', shot.kind === 'photo' && shot.fileId === 'big' && shot.mime === 'image/jpeg' && shot.name === 'скриншот');
  const png = pieceOf({ document: { file_name: 'Переписка.PNG', file_id: 'f1', file_size: 500 } });
  check('скриншот файлом (png) — тоже картинка', png.kind === 'photo' && png.mime === 'image/png' && png.fileId === 'f1');
}
check('текст — как есть; пустое — ничего', pieceOf({ text: ' нужен ролик ' }).text === 'нужен ролик' && pieceOf({ sticker: {} }) === null);

// Word: абзацы, списки, таблицы — без DOM
const P = t => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const LI = t => `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;
const TBL = '<w:tbl><w:tr><w:tc>' + P('Формат') + '</w:tc><w:tc>' + P('4K &amp; 25 fps') + '</w:tc></w:tr></w:tbl>';
const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${P('ТЕХНИЧЕСКОЕ ЗАДАНИЕ')}${LI('Заставка 10 с')}${LI('Отбивки')}${TBL}</w:body></w:document>`;
const wt = wordXmlText(xml);
check('Word: заголовок, пункты списка, строка таблицы, сущности', wt.startsWith('ТЕХНИЧЕСКОЕ ЗАДАНИЕ') && wt.includes('• Заставка 10 с') && wt.includes('• Отбивки')
  && wt.includes('Формат | 4K & 25 fps'), JSON.stringify(wt));

// настоящий .docx — zip со сжатым document.xml
function zip(name, data) {
  const nb = Buffer.from(name), raw = Buffer.from(data), comp = zlib.deflateRawSync(raw);
  const crc = zlib.crc32 ? zlib.crc32(raw) : 0;
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nb.length, 26);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(raw.length, 24); cen.writeUInt16LE(nb.length, 28); cen.writeUInt32LE(0, 42);
  const body = Buffer.concat([local, nb, comp]), cd = Buffer.concat([cen, nb]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(body.length, 16);
  return new Uint8Array(Buffer.concat([body, cd, end]));
}
const dt = await docxText(zip('word/document.xml', xml));
check('docx: сжатый документ читается сервером', dt === wt, dt);
check('docx: не docx — понятная ошибка', /не похож на \.docx/.test(await docxText(new Uint8Array(100)).then(() => '', e => e.message)));

// сборка заявки
const items = [
  { kind: 'docx', name: 'ТЗ_Ривьера_Сосновый.docx', text: 'Два ролика по 60 секунд', sender: 'Олег Петров' },
  { kind: 'audio', name: 'голосовое', text: 'Срок — до конца ноября', sender: '' },
  { kind: 'text', name: 'сообщение', text: 'Бюджет обсуждаем', sender: 'Олег Петров' }
];
const src = compileSource(items);
check('ТЗ: всё присланное одним текстом, с именами и авторами', src.startsWith('=== ТЗ_Ривьера_Сосновый.docx (от Олег Петров)\nДва ролика') && src.includes('=== голосовое\nСрок'));
check('название — по документу, клиент — по автору', guessTitle(items) === 'ТЗ Ривьера Сосновый' && guessClient(items) === 'Олег Петров');
check('без документа — первая строка текста; без всего — запасное', guessTitle([{ kind: 'text', name: 's', text: 'Нужен ролик для салона', sender: '' }]) === 'Нужен ролик для салона'
  && guessTitle([{ kind: 'photo', name: 'фото', text: '', sender: '' }]) === 'Заявка из Telegram');

// разбор → бриф → вилка → сообщение
const r = { summary: 'Два имиджевых AI-ролика', items: [{ group: 'Ролик', name: 'Генерация', role: 'ai', min: 40, max: 60, base: true }, { group: 'Ролик', name: '3D', role: '3d', min: 10, max: 10, base: false }],
  questions: [{ q: 'Вертикальные или горизонтальные?', why: 'кадр' }], options: [], plan: [{ stage: 'Сценарий', days: 5 }], model: 'Claude' };
const b = applyBrief(r, '2026-10-22');
check('разбор: работы с вариантами, вопросы новыми, план', b.estimate.items[1].variant === 'full' && b.questions[0].status === 'новый' && b.plan.length === 1 && b.analysis.at === '2026-10-22');
const range = estimateRange(b.estimate, [{ id: 'ai', rate: 2000 }, { id: '3d', rate: 2000 }]);
check('вилка: часы × ставки + 10%, вверх до 5 000', range.min === 110000 && range.max === 155000, JSON.stringify(range));
const msg = summaryText({ title: 'Два AI-ролика', client: 'СтройГрупп', analysis: b.analysis, questions: b.questions, range, link: 'https://app/#brief=x', parts: 3, model: 'Claude' });
check('сообщение: суть, вилка, вопросы, ссылка на бриф', msg.includes('Бриф готов: Два AI-ролика — СтройГрупп') && msg.includes('110 000 ₽ – 155 000 ₽')
  && msg.includes('1. Вертикальные') && msg.includes('#brief=x'), msg);
check('кнопки: «Разобрать», «Ответы к брифу», «Кто это?», «Отмена»', KEYBOARD.keyboard.flat().map(x => x.text).join() === [GO, ANSWERS, WHO, CANCEL].join());
{
  // ответы клиента к брифу
  const briefs = [{ id: 'u', title: 'Оформление видеодайджеста «PRO Химпром» для сотрудников группы', client: 'Химпром', lead_id: 'l1' },
    { id: 'd', title: 'Два AI-ролика', client: 'СтройГрупп', lead_id: 'l2' }];
  const leads = [{ id: 'l1', name: 'Химпром — Мария Соколова' }, { id: 'l2', name: 'СтройГрупп — Олег Петров' }];
  check('ответы: бриф угадан по фамилии отправителя', guessBrief('Мария Соколова', briefs, leads)?.id === 'u' && guessBrief('Вася', briefs, leads) === null);
  const kb = briefKeyboard(briefs, briefs[1], CANCEL);
  check('ответы: угаданный бриф первой кнопкой, «Отмена» последней, выбор по кнопке', kb.keyboard[0][0].text.includes('Два AI-ролика') && kb.keyboard.at(-1)[0].text === CANCEL
    && pickBrief(kb.keyboard[1][0].text, briefs)?.id === 'u' && pickBrief('Два AI-ролика', briefs) === null);
  const who = briefKeyboard(briefs, null, CANCEL, WHO_PICK).keyboard[0][0].text;
  check('«Кто это?»: своя метка, с выбором ответов не путается', who.startsWith(WHO_PICK) && pickBrief(who, briefs, WHO_PICK)?.id === 'u'
    && pickBrief(who, briefs) === null && pickBrief(kb.keyboard[1][0].text, briefs, WHO_PICK) === null && !WHO.startsWith(WHO_PICK + 'Оформ'));
  const prompt = buildAnswersPrompt(['Какие сроки?', 'Хромакей или LED?'], 'Анастасия: снимаем на хромакее, старт в декабре');
  check('ответы: в запросе вопросы по номерам и переписка', prompt.includes('1. Какие сроки?') && prompt.includes('снимаем на хромакее'));
  const parsed = parseAnswers('```json\n{"answers":[{"n":2,"answer":"Хромакей"},{"n":9,"answer":"лишний"},{"n":1,"answer":""}],"other":"Старт в декабре"}\n```', 2);
  check('ответы: разбор JSON — лишние номера и пустые ответы отброшены', parsed.answers.size === 1 && parsed.answers.get(2) === 'Хромакей' && parsed.other === 'Старт в декабре');
  const upd = applyAnswers({ questions: [{ q: 'Какие сроки?', status: 'задан' }, { q: 'Хромакей или LED?', status: 'задан' }], source_text: 'ТЗ' }, parsed, 'Анастасия: хромакей', '2026-10-24');
  check('ответы: в бриф — ответ и статус, переписка в конец ТЗ, следующий шаг', upd.questions[1].answer === 'Хромакей' && upd.questions[1].status === 'ответ' && upd.questions[0].status === 'задан'
    && upd.source_text.endsWith('=== Ответ клиента (2026-10-24)\nАнастасия: хромакей') && upd.next_step.includes('осталось вопросов: 1') && JSON.stringify(upd.open) === '[1]');
  const msg = answersText('Дайджест', upd.questions, upd.got, upd.open, parsed.other, 'https://hub.adervis.ru/#brief=u');
  check('ответы: сообщение бота — что записано, что без ответа, ссылка', msg.includes('1 из 2') && msg.includes('✓ 2. Хромакей или LED?') && msg.includes('Без ответа: 1') && msg.includes('Старт в декабре'));
  let bad = false; try { parseAnswers('не json', 2); } catch { bad = true; }
  check('ответы: модель ответила не JSON — понятная ошибка', bad);
}

{
  // заявка с формы сайта → лид в Hub
  const text = 'Новая заявка с сайта\nИмя: Олег\nКонтакт: +7 900 555-01-23\nУслуга: Видеоролик\nНужен ролик для выставки\n\n———\nСтраница: /video/\nUTM · source=yandex · campaign=promo\nСмотрел кейс: lukoil-ai';
  const l = siteLeadOf(text);
  check('сайт: заявка — имя с контактом, суть без служебных строк, страница и UTM отдельно', l.name === 'Олег, +7 900 555-01-23'
    && l.request === 'Услуга: Видеоролик Нужен ролик для выставки' && l.page === '/video/' && l.utm === 'source=yandex · campaign=promo' && l.lastCase === 'lukoil-ai', JSON.stringify(l));
  check('сайт: без контакта — не заявка; одинаковый текст — один отпечаток', siteLeadOf('Имя: Олег\nПросто привет') === null && fingerprint(text) === fingerprint(text) && fingerprint(text) !== fingerprint(text + '!'));
  const ok = pageCheck('https://adervis.ru/', 200, '<html><head><title>Видеопродакшн в Перми · ADERVIS</title><meta name="description" content="Снимаем рекламные ролики, корпоративное видео и контент для брендов. Пермь и вся Россия."><meta property="og:image" content="/og.png"></head><body><h1>ADERVIS</h1></body></html>');
  check('сайт: хорошая страница — без замечаний', ok.problems.length === 0 && ok.title.startsWith('Видеопродакшн') && ok.h1 === 1, JSON.stringify(ok.problems));
  const badp = pageCheck('https://adervis.ru/x/', 200, '<title>' + 'Очень длинный заголовок '.repeat(5) + '</title><h1>a</h1><h1>b</h1>');
  check('сайт: длинный заголовок, нет описания и картинки, два H1 — всё перечислено', badp.problems.length === 4 && badp.problems.some(x => x.includes('H1: 2')), badp.problems.join(' | '));
  check('сайт: недоступная страница — одно понятное замечание', pageCheck('https://adervis.ru/y/', 404, '').problems.join() === 'страница отвечает 404');
  check('сайт: адреса из sitemap и слаг кейса', sitemapUrls('<url><loc>https://adervis.ru/</loc></url><url><loc> https://adervis.ru/cases/brait/ </loc></url>').length === 2
    && caseSlug('https://adervis.ru/cases/brait/') === 'brait' && caseSlug('https://adervis.ru/cases/') === '' && caseSlug('https://adervis.ru/video/') === '');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
