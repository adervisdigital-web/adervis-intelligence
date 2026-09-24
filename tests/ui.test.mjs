// Интерфейс общей базы проверяется на подменённом сервере: настоящий Supabase
// появится, когда владелец создаст проект.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SEEDFILE = path.join(HERE, '..', '..', 'local-0.3', 'adervis-seed.json');
const OUT = path.join(HERE, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const seed = JSON.parse(fs.readFileSync(SEEDFILE, 'utf8'));

let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  -> ' + extra : '')); };

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png'
};
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(path.resolve(ROOT))) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';

const fake = (seedData) => {
  const state = {
    knowledge: seedData.knowledge.map(o => ({ ...o, _at: '2026-09-01T10:00:00Z', _by: 'artem@adervis.ru' })),
    content: seedData.content.map(o => ({ ...o, _at: '2026-09-01T10:00:00Z', _by: 'artem@adervis.ru' })),
    tasks: seedData.tasks.map(o => ({ ...o, _at: '2026-09-01T10:00:00Z', _by: 'artem@adervis.ru' })),
    metrics: [],
    files: [],
    brand: [
      { id: 'colors-base', title: 'Базовые цвета', kind: 'colors', sort: 20, _at: '2026-09-01T10:00:00Z', _by: 'artem@adervis.ru',
        data: { items: [{ name: 'Фон', hex: '#141414', usage: 'основной фон' }, { name: 'Золото', hex: '#f6bd3a', usage: 'акцент' }] } },
      { id: 'fonts', title: 'Шрифты', kind: 'fonts', sort: 40, _at: '2026-09-01T10:00:00Z', _by: 'artem@adervis.ru',
        data: { items: [{ family: 'Unbounded', role: 'Заголовки', weights: '500, 700', sample: 'ADERVIS' },
          { family: 'TT Fors', role: 'Текст', weights: 'Regular', sample: 'Визуал для бизнеса', file: 'brand/tt-fors-regular.ttf' }] } },
      { id: 'patterns', title: 'Паттерны', kind: 'gallery', sort: 85, _at: '2026-09-01T10:00:00Z', _by: 'artem@adervis.ru',
        data: { items: [{ file: 'brand/gallery/pattern-1.jpg', caption: 'Паттерн 1' }, { file: 'brand/gallery/pattern-2.jpg', caption: 'Паттерн 2' }] } },
      { id: 'voice', title: 'Как мы говорим', kind: 'text', sort: 90, _at: '2026-09-01T10:00:00Z', _by: 'artem@adervis.ru',
        data: { body: 'Пишем живо и просто.\n— Без канцелярита\n— Без выдуманных цифр' } }
    ],
    members: [{ email: 'artem@adervis.ru', name: 'Артём' }, { email: 'alex@adervis.ru', name: 'Александр' }],
    activity: []
  };
  window.__STORAGE__ = [];
  let session = null;
  let nextFails = null;
  const now = () => new Date().toISOString();
  const log = (action, entity, o, actor = session) => state.activity.unshift({ id: state.activity.length + 1, at: now(), actor, entity, entity_id: o.id, action, title: o.title ?? null });
  const clone = x => JSON.parse(JSON.stringify(x));
  const boom = () => { if (nextFails) { nextFails = null; throw new Error('Failed to fetch'); } };

  window.__STATE__ = state;
  window.__aiFail = null;
  window.__aiReply = {
    drafts: [
      { title: 'Смета: что забывают посчитать', body: 'В смете легко посчитать камеру и съёмочный день.', sources: ['k1', 'k12'] },
      { title: 'Один ролик для всех экранов', body: 'Ролик для выставки и для телефона — разный темп.', sources: [] }
    ],
    gaps: ['Не хватает подтверждённых цифр по срокам'],
    factsUsed: 12,
    left: 29
  };
  window.__failNext = () => { nextFails = true; };
  // правка «вторым руководителем», пока окно открыто
  window.__otherEdits = (table, id, title) => {
    const row = state[table].find(x => x.id === id);
    row.title = title; row._at = now(); row._by = 'alex@adervis.ru';
    log('update', table, row, 'alex@adervis.ru');
  };

  window.__INTEL_API__ = {
    async user() { return session ? { email: session } : null; },
    async signIn(email, password) {
      if (password !== 'secret') { const e = new Error('Invalid login credentials'); throw e; }
      session = email.trim().toLowerCase();
    },
    async signOut() { session = null; },
    onSignedOut() {},
    async isMember() { return state.members.some(m => m.email === session); },
    async load() { return clone(state); },
    async insert(table, o) {
      boom();
      const saved = { ...clone(o), _at: now(), _by: session };
      state[table].push(saved); log('insert', table, saved);
      return clone(saved);
    },
    async update(table, o) {
      boom();
      const cur = state[table].find(x => x.id === o.id);
      if (!cur) throw new Error('Запись не найдена');
      if (cur._at !== o._at) { const e = new Error('Запись изменена'); e.name = 'Conflict'; throw e; }
      Object.assign(cur, clone(o), { _at: now(), _by: session });
      log('update', table, cur);
      return clone(cur);
    },
    async uploadFile(record, file) {
      boom();
      const path = `${record}/${state.files.length + 1}-${file.name}`;
      window.__STORAGE__.push(path);
      const row = { id: 'f' + (state.files.length + 1), record, name: file.name, path, mime: file.type || '', size: file.size, _at: now(), _by: session };
      state.files.push(row);
      log('insert', 'files', row);
      return clone(row);
    },
    async fileUrl(path) {
      // Для шрифтов подменяем ссылку на настоящий файл с того же адреса:
      // так проверяется и загрузка, и то, что правила безопасности не мешают.
      if (path.startsWith('brand/gallery/')) { (window.__SHOTS__ ||= []).push(path); return 'brand/icon.svg'; }
      if (path.startsWith('brand/')) { window.__FONT_ASKED__ = path; return 'fonts/golostext-400-latin.woff2'; }
      return 'data:text/plain,' + encodeURIComponent(path);
    },
    async removeStorage(paths) { window.__STORAGE__ = window.__STORAGE__.filter(p => !paths.includes(p)); },
    async remove(table, id) {
      boom();
      const row = state[table].find(x => x.id === id);
      state[table] = state[table].filter(x => x.id !== id);
      if (table === 'knowledge') {
        state.files.filter(f => f.record === id).forEach(f => log('delete', 'files', f));
        state.files = state.files.filter(f => f.record !== id);
      }
      if (table === 'content') {
        state.metrics.filter(m => m.post === id).forEach(m => log('delete', 'metrics', m));
        state.metrics = state.metrics.filter(m => m.post !== id);
      }
      if (row) log('delete', table, row);
    },
    async generate(payload) {
      window.__lastAiPayload = payload;
      if (window.__aiFail) throw new Error(window.__aiFail);
      return JSON.parse(JSON.stringify(window.__aiReply));
    },
    async upsertAll(table, list) {
      boom();
      for (const o of list) {
        const i = state[table].findIndex(x => x.id === o.id);
        const saved = { ...clone(o), _at: now(), _by: session };
        if (i < 0) { state[table].push(saved); log('insert', table, saved); }
        else { state[table][i] = saved; log('update', table, saved); }
      }
    }
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(fake, seed);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const login = async (email = 'artem@adervis.ru', pass = 'secret') => {
  await page.fill('#gate-email', email);
  await page.fill('#gate-pass', pass);
  await page.click('#gatebtn');
};
const nav = id => page.click(`#nav button[data-page=${id}]`);
const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__STATE__)));

// --- 1. вход
await page.goto(BASE);
await page.waitForSelector('#gate:not([hidden])');
check('экран входа показан, приложение скрыто', await page.isHidden('#shell'));
await login('artem@adervis.ru', 'wrong');
await page.waitForSelector('#gateerror:not(:empty)');
check('неверный пароль: понятное сообщение', (await page.textContent('#gateerror')).includes('Неверная почта или пароль'));
await login('stranger@gmail.com', 'secret');
await page.waitForFunction(() => document.querySelector('#gateerror').textContent.includes('не добавлен'));
check('посторонний с верным паролем не попадает внутрь', await page.isHidden('#shell'));
await login();
await page.waitForSelector('#shell:not([hidden])');
check('свой вошёл', await page.isVisible('#shell'));
check('в боковом меню его имя', (await page.textContent('#myname')) === 'Артём');
check('на главной 24 записи', (await page.$$eval('.metric .value', v => v[0].textContent)) === '24');
await page.screenshot({ path: path.join(OUT, 'intel-home.png') });

// --- 2. создание записи
await nav('knowledge');
await page.click('[data-action=newk]');
await page.fill('#kf input[name=title]', 'Новая запись о студии');
await page.fill('#kf textarea[name=body]', 'Текст записи');
await page.click('#kf button.primary');
await page.waitForSelector('#modal:not([open])', { state: 'attached' });
check('запись создана и ушла на сервер', (await state()).knowledge.some(k => k.title === 'Новая запись о студии'));
check('запись видна в списке', (await page.$$eval('article[data-k] h2', h => h.map(x => x.textContent))).includes('Новая запись о студии'));

// --- 3. одновременная правка двумя людьми
await page.click('article[data-k=k1]');
await page.evaluate(() => window.__otherEdits('knowledge', 'k1', 'Правка Александра'));
await page.fill('#kf input[name=title]', 'Моя правка');
await page.click('#kf button.primary');
await page.waitForFunction(() => document.querySelector('#alerts').textContent.includes('второй руководитель'));
check('конфликт правок пойман, чужой текст не затёрт', (await state()).knowledge.find(k => k.id === 'k1').title === 'Правка Александра');
check('окно осталось открытым — свой текст можно скопировать', await page.evaluate(() => document.querySelector('#modal').open));
check('в поле остался мой текст', (await page.inputValue('#kf input[name=title]')) === 'Моя правка');
await page.keyboard.press('Escape');

// --- 4. удаление
await nav('knowledge');
await page.click('article[data-k=k24]');
await page.click('#modal [data-action=delk]');
await page.click('#confirmdel');
await page.waitForFunction(() => !document.querySelector('article[data-k=k24]'));
check('запись удалена на сервере', !(await state()).knowledge.some(k => k.id === 'k24'));

// --- 5. публикация, замеры, каскад
await nav('content');
await page.click('[data-action=newp]');
await page.fill('#pf input[name=title]', 'Тестовый пост');
await page.fill('#pf textarea[name=body]', 'Коротко.');
await page.click('#pf button.primary');
await page.waitForFunction(() => !document.querySelector('#modal').open);
const postId = (await state()).content.find(p => p.title === 'Тестовый пост').id;
for (const [date, views, leads] of [['2026-09-10', 500, 1], ['2026-09-12', 1200, 3]]) {
  await nav('analytics');
  await page.click('[data-action=newmetric]');
  await page.selectOption('#mf select[name=post]', postId);
  await page.fill('#mf input[name=date]', date);
  await page.fill('#mf input[name=views]', String(views));
  await page.fill('#mf input[name=replies]', '0');
  await page.fill('#mf input[name=leads]', String(leads));
  await page.click('#mf button.primary');
  await page.waitForFunction(() => !document.querySelector('#modal').open);
}
await nav('home');
const card = await page.$$eval('.metric', c => c[3].innerText.replace(/\s+/g, ' '));
check('карточка лидов считает последний замер', /ЛИДЫ 3 Просмотры: 1\s?200 · публикаций: 1/.test(card), card);
await nav('content');
await page.click(`article[data-p="${postId}"]`);
await page.click('#modal [data-action=delp]');
check('предупреждение о двух замерах', (await page.textContent('#modal')).includes('(2)'));
await page.click('#confirmdel');
await page.waitForFunction(() => !document.querySelector('#modal').open);
const s5 = await state();
check('публикация и её замеры удалены', !s5.content.some(p => p.id === postId) && s5.metrics.length === 0);

// --- 6. задачи
await nav('tasks');
await page.check('input[data-task=t1]');
await page.waitForFunction(() => window.__STATE__.tasks.find(t => t.id === 't1').done === true);
check('отметка задачи сохранилась на сервере', true);
await page.click('[data-action=deltask][data-id=t5]');
await page.click('#confirmdel');
await page.waitForFunction(() => !window.__STATE__.tasks.some(t => t.id === 't5'));
check('задача удалена', true);

// --- 7. журнал
await nav('settings');
const rows = await page.$$eval('.card:has(h2:text("Журнал изменений")) .row', rs => rs.map(r => r.innerText.replace(/\s+/g, ' ')));
check('журнал показывает правку второго руководителя', rows.some(r => /Изменил запись.*Правка Александра.*Александр/.test(r)), rows[0]);
check('журнал показывает мои действия', rows.some(r => /Добавил запись.*Новая запись о студии.*Артём/.test(r)));
check('журнал показывает удаление', rows.some(r => /Удалил запись/.test(r)));
await page.screenshot({ path: path.join(OUT, 'intel-settings.png') });

// --- 8. перенос данных из локальной версии
await page.setInputFiles('#importfile', SEEDFILE);
await page.waitForSelector('#confirm');
await page.click('#confirm');
await page.waitForFunction(() => document.querySelector('#alerts').textContent.includes('Перенесено'));
const s8 = await state();
check('перенос вернул удалённую запись и не создал дублей', s8.knowledge.filter(k => k.id === 'k24').length === 1);
check('перенос не затронул мою новую запись', s8.knowledge.some(k => k.title === 'Новая запись о студии'));

// --- 9. обрыв связи
await nav('tasks');
await page.evaluate(() => window.__failNext());
await page.click('[data-action=newtask]');
await page.fill('#tf input[name=title]', 'Задача без связи');
await page.click('#tf button');
await page.waitForFunction(() => document.querySelector('#alerts').textContent.includes('Нет связи'));
check('при обрыве связи честно сообщает, что не сохранено', !(await state()).tasks.some(t => t.title === 'Задача без связи'));
await page.keyboard.press('Escape');

// --- 10. бриф без внутренних записей
await nav('assistant');
await page.click('[data-action=brief]');
const brief = await page.inputValue('#briefout');
check('в бриф не попали внутренние записи', !brief.includes('История и цели') && !brief.includes('Оборудование'));
check('в бриф не попали непроверенные записи', !brief.includes('Цифры на сайте'));
check('в брифе есть публичные факты', brief.includes('Позиционирование сайта'));
await page.keyboard.press('Escape');

// --- 9б. брендбук
await nav('brand');
check('брендбук показывает логотипы', (await page.$$('.logoframe img')).length === 3);
const logosDrawn = await page.waitForFunction(
  () => { const i = [...document.querySelectorAll('.logoframe img')]; return i.length === 3 && i.every(x => x.complete && x.naturalWidth > 0); },
  null, { timeout: 8000 }).then(() => true).catch(() => false);
check('логотипы действительно отрисовались', logosDrawn);
check('цвета показаны образцами', (await page.$$('.swatch')).length === 2);
check('у образца виден код цвета', (await page.textContent('.swatch')).includes('#141414'));
check('образец шрифта набран фирменным шрифтом',
  (await page.$eval('.sampletext', e => getComputedStyle(e).fontFamily)).includes('Unbounded'));
check('фирменный шрифт действительно загрузился',
  await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('500 26px Unbounded'); }));
check('правила показаны списком', (await page.$$eval('.brandtext li', l => l.map(x => x.textContent))).includes('Без канцелярита'));
check('шрифт из закрытого хранилища запрошен по временной ссылке',
  (await page.evaluate(() => window.__FONT_ASKED__ || null)) === 'brand/tt-fors-regular.ttf');
const fontAdded = await page.waitForFunction(
  // браузер отдаёт имя семейства с пробелом в кавычках
  () => [...document.fonts].some(f => f.family.replace(/^"|"$/g, '') === 'TT Fors' && f.status === 'loaded'),
  null, { timeout: 8000 }).then(() => true).catch(() => false);
check('шрифт из хранилища подключается к странице', fontAdded);
await page.screenshot({ path: path.join(OUT, 'intel-brand.png'), fullPage: true });

// галереи материалов
await page.waitForFunction(() => document.querySelectorAll('.gallery img[src]').length === 2);
check('картинки галереи подставлены из хранилища',
  await page.$$eval('.gallery img', imgs => imgs.every(i => i.complete && i.naturalWidth > 0)));
check('за картинками ходили по временным ссылкам',
  (await page.evaluate(() => window.__SHOTS__.length)) === 2);
check('подписи под картинками на месте',
  (await page.$$eval('.gallery figcaption', f => f.map(x => x.textContent))).join() === 'Паттерн 1,Паттерн 2');

// брендбук слайдами
await page.click('[data-action=deckon]');
await page.waitForSelector('.slide.is-current');
const slideCount = await page.$$eval('.slide', s => s.length);
// обложка + знак + 4 темы (цвета, шрифты, галерея, текст) + финал
check('слайды собраны по темам', slideCount === 7, String(slideCount));
check('видно ровно один слайд', (await page.$$eval('.slide.is-current', s => s.length)) === 1);
const ratio = await page.$eval('.slide.is-current', e => { const r = e.getBoundingClientRect(); return +(r.width / r.height).toFixed(2); });
check('слайд в пропорции 16:9', Math.abs(ratio - 1.78) < 0.03, String(ratio));
check('первый слайд — обложка', (await page.textContent('.slide.is-current')).includes('Брендбук'));
await page.keyboard.press('ArrowRight');
await page.waitForFunction(() => document.querySelector('.slide.is-current').textContent.includes('Знак'));
check('стрелка листает на слайд знака', (await page.$$('.slide.is-current .sframe')).length === 3);
await page.keyboard.press('ArrowRight');
await page.waitForFunction(() => document.querySelector('.deckbar small').textContent.includes('слайд 3'));
check('счётчик слайдов идёт следом', true);
await page.screenshot({ path: path.join(OUT, 'intel-deck.png') });

await page.emulateMedia({ media: 'print' });
const printed = await page.evaluate(() => {
  const all = [...document.querySelectorAll('.slide')];
  return { visible: all.filter(s => getComputedStyle(s).display !== 'none').length, bar: getComputedStyle(document.querySelector('.deckbar')).display };
});
check('в печать уходят все слайды', printed.visible === slideCount, JSON.stringify(printed));
check('панель управления в печать не попадает', printed.bar === 'none');
await page.emulateMedia({ media: 'screen' });
await page.click('[data-action=deckoff]');
await page.waitForSelector('.swatch');

await page.click('[data-action=editbrand][data-id="colors-base"]');
check('правка идёт строками', (await page.inputValue('#bf textarea')).startsWith('Фон | #141414 | основной фон'));
await page.fill('#bf textarea', 'Фон | не-цвет | основной фон');
await page.click('#bf button.primary');
await page.waitForFunction(() => document.querySelector('#alerts').textContent.includes('вместо цвета'));
check('неверный цвет не сохраняется с понятной подсказкой',
  (await state()).brand.find(b => b.id === 'colors-base').data.items.length === 2);
await page.fill('#bf textarea', 'Фон | #101010 | тёмный фон\nЗолото | #f6bd3a | акцент\nБелый | #ffffff | текст на тёмном');
await page.click('#bf button.primary');
await page.waitForFunction(() => window.__STATE__.brand.find(b => b.id === 'colors-base').data.items.length === 3);
check('правка брендбука сохраняется', (await page.$$('.swatch')).length === 3);
check('изменение попало в журнал', (await state()).activity.some(a => a.entity === 'brand' && a.action === 'update'));

// --- 10а. файлы в записях
await nav('knowledge');
await page.click('article[data-k=k1]');
check('в записи есть раздел файлов', (await page.textContent('#filelist')).includes('Файлов пока нет'));
await page.setInputFiles('#fileinput', { name: 'брендбук.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 проверка') });
await page.waitForFunction(() => window.__STATE__.files.length === 1);
check('файл попал в хранилище', (await page.evaluate(() => window.__STORAGE__.length)) === 1);
check('файл виден в списке записи', (await page.textContent('#filelist')).includes('брендбук.pdf'));
await page.screenshot({ path: path.join(OUT, 'intel-files.png') });
const layout = await page.evaluate(() => {
  const row = document.querySelector('.filerow');
  const dialog = document.querySelector('#modal');
  const r = row.getBoundingClientRect(), d = dialog.getBoundingClientRect();
  const btns = [...row.querySelectorAll('button')].map(b => b.getBoundingClientRect().width > 0);
  return { fits: r.right <= d.right + 1 && r.left >= d.left - 1, buttons: btns.length, allVisible: btns.every(Boolean), overflow: dialog.scrollWidth > dialog.clientWidth + 1 };
});
check('строка файла умещается в окно записи', layout.fits && !layout.overflow, JSON.stringify(layout));
check('кнопки «Открыть» и «удалить» на месте', layout.buttons === 2 && layout.allVisible);
await page.keyboard.press('Escape');
check('на карточке записи виден счётчик файлов', (await page.textContent('article[data-k=k1]')).includes('Файлов: 1'));

await page.click('article[data-k=k1]');
page.once('dialog', d => d.accept());
await page.click('[data-action=delfile]');
await page.waitForFunction(() => window.__STATE__.files.length === 0);
check('удаление файла убирает его и из хранилища', (await page.evaluate(() => window.__STORAGE__.length)) === 0);
await page.keyboard.press('Escape');

await page.click('[data-action=newk]');
check('у несохранённой записи вместо файлов подсказка', (await page.textContent('#modal')).includes('после сохранения записи'));
await page.keyboard.press('Escape');

// файлы удаляются вместе с записью
await page.click('article[data-k=k22]');
await page.setInputFiles('#fileinput', { name: 'кейс.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-jpeg') });
await page.waitForFunction(() => window.__STATE__.files.length === 1);
await page.click('#modal [data-action=delk]');
check('перед удалением записи предупреждают о файлах', (await page.textContent('#modal')).includes('файлы (1)'));
await page.click('#confirmdel');
await page.waitForFunction(() => window.__STATE__.files.length === 0);
check('вместе с записью удалены её файлы из хранилища', (await page.evaluate(() => window.__STORAGE__.length)) === 0);

// --- 10б. ИИ пишет черновики
await nav('assistant');
await page.selectOption('#channel', 'Telegram');
await page.selectOption('#count', '3');
await page.fill('#goal', 'Написать посты про смету и подготовку к съёмке');
await page.click('[data-action=write]');
await page.waitForSelector('[data-action=savedraft]');
const payload = await page.evaluate(() => window.__lastAiPayload);
check('на сервер уходит только задание, без фактов', JSON.stringify(Object.keys(payload).sort()) === '["author","channel","count","goal","product"]', JSON.stringify(payload));
check('задание передано полностью', payload.channel === 'Telegram' && payload.count === 3 && payload.goal.includes('смету'));
check('черновики показаны', (await page.$$('[data-action=savedraft]')).length === 2);
check('видны источники черновика', (await page.$$eval('article .tag', t => t.map(x => x.textContent))).some(t => t.includes('ADERVIS')));
check('предупреждение о нехватке фактов показано', (await page.textContent('#view')).includes('Не хватает подтверждённых цифр'));
check('остаток запросов показан', (await page.textContent('#view')).includes('Осталось запросов сегодня: 29'));
check('черновик без источников помечен', (await page.textContent('#view')).includes('Источники не указаны'));

await page.click('[data-action=savedraft][data-id="0"]');
await page.waitForFunction(() => window.__STATE__.content.some(p => p.title === 'Смета: что забывают посчитать' && p.status === 'Черновик'));
const draft = (await state()).content.find(p => p.title === 'Смета: что забывают посчитать');
check('черновик сохранён с площадкой и направлением из формы', draft.channel === 'Telegram' && draft.product === 'CRM' && draft.author === 'Артём', JSON.stringify(draft));
check('кнопка сохранения больше не активна', await page.isDisabled('[data-action=savedraft][data-id="0"]'));

await page.screenshot({ path: path.join(OUT, 'intel-ai-drafts.png'), fullPage: true });
await page.click('article .tag');
check('источник открывает запись базы знаний', await page.evaluate(() => document.querySelector('#modal').open));
await page.keyboard.press('Escape');

await page.evaluate(() => { window.__aiFail = 'Дневной лимит исчерпан: 30 запросов за сутки. Попробуйте завтра.'; });
await page.click('[data-action=write]');
await page.waitForSelector('.notice.error');
check('лимит показан понятным текстом', (await page.textContent('.notice.error')).includes('Дневной лимит исчерпан'));
check('после ошибки черновики убраны', (await page.$$('[data-action=savedraft]')).length === 0);
check('задание в форме не потеряно', (await page.inputValue('#goal')).includes('смету'));
await page.evaluate(() => { window.__aiFail = null; });
await page.screenshot({ path: path.join(OUT, 'intel-ai.png') });

// --- 11. выход и «запомнить меня»
await page.click('[data-action=signout]');
await page.waitForSelector('#gate:not([hidden])');
check('выход возвращает на экран входа', await page.isHidden('#shell'));
check('почта подставлена после выхода', (await page.inputValue('#gate-email')) === 'artem@adervis.ru');
check('пароль не сохраняется на странице', (await page.inputValue('#gate-pass')) === '');
check('пароля нет в хранилище браузера',
  await page.evaluate(() => !Object.keys(localStorage).some(k => (localStorage.getItem(k) || '').includes('secret'))));
check('курсор сразу в поле пароля', await page.evaluate(() => document.activeElement.id === 'gate-pass'));

await page.click('#showpass');
check('пароль можно показать', (await page.getAttribute('#gate-pass', 'type')) === 'text');
await page.click('#showpass');
check('и снова скрыть', (await page.getAttribute('#gate-pass', 'type')) === 'password');

// вход без галочки — почту забываем
await page.uncheck('#remember');
await login();
await page.waitForSelector('#shell:not([hidden])');
await page.click('[data-action=signout]');
await page.waitForSelector('#gate:not([hidden])');
check('без галочки почта не запоминается', (await page.inputValue('#gate-email')) === '');
await page.check('#remember');
await login();
await page.waitForSelector('#shell:not([hidden])');
await page.click('[data-action=signout]');
await page.waitForSelector('#gate:not([hidden])');

// --- 12. телефон
const m = await ctx.newPage();
await m.setViewportSize({ width: 390, height: 844 });
await m.goto(BASE);
await m.fill('#gate-email', 'alex@adervis.ru');
await m.fill('#gate-pass', 'secret');
await m.click('#gatebtn');
await m.waitForSelector('#shell:not([hidden])');
await m.screenshot({ path: path.join(OUT, 'intel-mobile-gate.png') });
await m.click('#menu');
await m.waitForTimeout(250);
const hit = await m.evaluate(() => {
  const r = document.querySelector('.brand').getBoundingClientRect();
  const el = document.elementFromPoint(r.left + 30, r.top + 15);
  return el && el.closest('.sidebar') ? 'sidebar' : 'other';
});
check('на телефоне меню поверх верхней панели', hit === 'sidebar');

// --- 13. обход всех разделов на узком экране
await m.evaluate(() => document.body.classList.remove('menu'));
const sections = ['home', 'knowledge', 'brand', 'products', 'cases', 'content', 'calendar',
  'assistant', 'analytics', 'competitors', 'tasks', 'roadmap', 'settings'];
const wide = [], small = [];
for (const id of sections) {
  await m.evaluate(s => document.querySelector(`#nav button[data-page=${s}]`).click(), id);
  await m.waitForTimeout(120);
  const r = await m.evaluate(() => {
    const doc = document.scrollingElement;
    const over = [...document.querySelectorAll('.main *')]
      .filter(e => e.getBoundingClientRect().right > window.innerWidth + 1)
      .map(e => e.className || e.tagName).slice(0, 3);
    const tap = [...document.querySelectorAll('.main button')]
      .filter(b => b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 36).length;
    return { scroll: doc.scrollWidth > window.innerWidth + 1, over, tap };
  });
  if (r.scroll) wide.push(id + ' (' + r.over.join(', ') + ')');
  if (r.tap) small.push(id + ':' + r.tap);
}
check('ни один раздел не уезжает вбок на телефоне', wide.length === 0, wide.join(' | '));
check('кнопки на телефоне не мельче 36 точек', small.length === 0, small.join(' | '));

// слайды листаются пальцем
await m.evaluate(() => document.querySelector('#nav button[data-page=brand]').click());
await m.waitForSelector('[data-action=deckon]');
await m.click('[data-action=deckon]');
await m.waitForSelector('.slide.is-current');
const box = await m.$eval('.slide.is-current', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; });
await m.mouse.move(box.x + box.w / 3, box.y);
await m.mouse.down();
await m.mouse.move(box.x - box.w / 3, box.y, { steps: 8 });
await m.mouse.up();
await m.waitForTimeout(200);
check('слайд листается смахиванием', (await m.textContent('.deckbar small')).includes('слайд 2'),
  await m.textContent('.deckbar small'));
await m.screenshot({ path: path.join(OUT, 'mobile-deck.png') });
await m.close();

check('ни одной ошибки в консоли (включая CSP)', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
