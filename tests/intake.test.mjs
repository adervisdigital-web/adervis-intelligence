// Приём заявок через служебного бота: что пришло, как читается, во что складывается.
import zlib from 'node:zlib';
import { senderOf, pieceOf, wordXmlText, docxText, compileSource, guessTitle, guessClient, applyBrief, estimateRange, summaryText, GO, CANCEL, KEYBOARD } from '../supabase/functions/_shared/intake.ts';

let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  -> ' + extra : '')); };

// кто автор пересланного
check('автор: пересланное от человека', senderOf({ forward_origin: { type: 'user', sender_user: { first_name: 'Константин', last_name: 'Лебедев' } } }) === 'Константин Лебедев');
check('автор: скрытый профиль, канал, старый формат', senderOf({ forward_origin: { type: 'hidden_user', sender_user_name: 'Паша' } }) === 'Паша'
  && senderOf({ forward_origin: { type: 'channel', chat: { title: 'Уралхим' } } }) === 'Уралхим' && senderOf({ forward_sender_name: 'Анастасия' }) === 'Анастасия');
check('автор: своё сообщение — без автора', senderOf({ text: 'привет' }) === '');

// что пришло
check('голосовое — расшифровать', pieceOf({ voice: { file_id: 'v1', file_size: 1000 } }).kind === 'audio' && pieceOf({ voice: { file_id: 'v1' } }).mime === 'audio/ogg');
check('docx, pdf, m4a как файл — читаем, у каждого свой способ', pieceOf({ document: { file_id: 'd', file_name: 'ТЗ Монави.docx' } }).kind === 'docx'
  && pieceOf({ document: { file_id: 'p', file_name: 'Бриф.PDF' } }).kind === 'pdf' && pieceOf({ document: { file_id: 'a', file_name: 'запись.m4a' } }).mime === 'audio/mp4');
check('фото — берём подпись', pieceOf({ photo: [{}], caption: 'референс' }).kind === 'photo' && pieceOf({ photo: [{}], caption: 'референс' }).text === 'референс');
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
  { kind: 'docx', name: 'ТЗ_Монави_Папушево.docx', text: 'Два ролика по 60 секунд', sender: 'Константин Лебедев' },
  { kind: 'audio', name: 'голосовое', text: 'Срок — до конца ноября', sender: '' },
  { kind: 'text', name: 'сообщение', text: 'Бюджет обсуждаем', sender: 'Константин Лебедев' }
];
const src = compileSource(items);
check('ТЗ: всё присланное одним текстом, с именами и авторами', src.startsWith('=== ТЗ_Монави_Папушево.docx (от Константин Лебедев)\nДва ролика') && src.includes('=== голосовое\nСрок'));
check('название — по документу, клиент — по автору', guessTitle(items) === 'ТЗ Монави Папушево' && guessClient(items) === 'Константин Лебедев');
check('без документа — первая строка текста; без всего — запасное', guessTitle([{ kind: 'text', name: 's', text: 'Нужен ролик для салона', sender: '' }]) === 'Нужен ролик для салона'
  && guessTitle([{ kind: 'photo', name: 'фото', text: '', sender: '' }]) === 'Заявка из Telegram');

// разбор → бриф → вилка → сообщение
const r = { summary: 'Два имиджевых AI-ролика', items: [{ group: 'Ролик', name: 'Генерация', role: 'ai', min: 40, max: 60, base: true }, { group: 'Ролик', name: '3D', role: '3d', min: 10, max: 10, base: false }],
  questions: [{ q: 'Вертикальные или горизонтальные?', why: 'кадр' }], options: [], plan: [{ stage: 'Сценарий', days: 5 }], model: 'Claude' };
const b = applyBrief(r, '2026-10-22');
check('разбор: работы с вариантами, вопросы новыми, план', b.estimate.items[1].variant === 'full' && b.questions[0].status === 'новый' && b.plan.length === 1 && b.analysis.at === '2026-10-22');
const range = estimateRange(b.estimate, [{ id: 'ai', rate: 2000 }, { id: '3d', rate: 2000 }]);
check('вилка: часы × ставки + 10%, вверх до 5 000', range.min === 110000 && range.max === 155000, JSON.stringify(range));
const msg = summaryText({ title: 'Два AI-ролика', client: 'ДСК ГРУПП', analysis: b.analysis, questions: b.questions, range, link: 'https://app/#brief=x', parts: 3, model: 'Claude' });
check('сообщение: суть, вилка, вопросы, ссылка на бриф', msg.includes('Бриф готов: Два AI-ролика — ДСК ГРУПП') && msg.includes('110 000 ₽ – 155 000 ₽')
  && msg.includes('1. Вертикальные') && msg.includes('#brief=x'), msg);
check('кнопки: «Разобрать» и «Отмена»', KEYBOARD.keyboard[0].map(x => x.text).join() === [GO, CANCEL].join());

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
