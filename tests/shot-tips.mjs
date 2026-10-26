// Снимки главной и верхней строки для глазной проверки: тёмная и светлая тема, свёрнутое меню.
// Запуск: node shot-nav.mjs (подменённый сервер — как в ui.test.mjs).
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(HERE, 'screenshots');
const src = fs.readFileSync(path.join(HERE, 'ui.test.mjs'), 'utf8');
// берём подменённый сервер из основных проверок, чтобы не держать вторую копию
const fakeSrc = src.slice(src.indexOf('const fake = (seedData) =>'), src.indexOf('const browser = await chromium.launch()'));
const fake = new Function('return ' + fakeSrc.replace('const fake = ', '').trim().replace(/;$/, ''))();
const seed = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'seed.json'), 'utf8'));
// пример брифа на шаге «Вопросы»: два вопроса заданы, один отвечен
const DEMO_LEAD = { id: 'lead-demo', came_on: '2026-10-23', name: 'Банк — Мария Иванова', source: 'Рекомендация', direction: 'Студия', request: 'ИИ-сериал', amount: 0, status: 'Новое', note: '', reached: 0, next_step: '', next_on: null, lost_reason: '' };
const DEMO_BRIEF = { id: 'brief-demo', lead_id: 'lead-demo', title: 'ИИ-сериал под ключ', client: 'Банк', stage: 'Вопросы', source_text: 'Запрос: ИИ-сериал под ключ: сценарии и генерации, от 2 серий в неделю, сезон 60 серий.',
  analysis: {}, questions: [{ q: 'Какой хронометраж серии?', why: '', status: 'задан', answer: '' }, { q: 'Есть ли постоянные персонажи?', why: '', status: 'задан', answer: '' }, { q: 'Когда старт?', why: '', status: 'ответ', answer: 'В декабре' }],
  estimate: { reserve: 10, round: 5000, items: [], options: [] }, plan: [], kp: {}, next_step: 'Получить ответы и посчитать серию', next_on: '2026-10-24', updated_at: '2026-10-25T10:00:00Z' };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, buf) => { if (err) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(buf); });
});
await new Promise(r => server.listen(0, r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(fake, seed);
const page = await ctx.newPage();
await page.goto(BASE);
await page.fill('#gate-email', 'artem@adervis.ru');
await page.fill('#gate-pass', 'secret');
await page.click('#gatebtn');
await page.waitForSelector('#shell:not([hidden])');
await page.evaluate(([l, b]) => { const st = window.__STATE__; st.leads.push({ ...l, _at: b.updated_at, _by: 'artem@adervis.ru' }); st.briefs.push({ ...b, _at: b.updated_at, _by: 'artem@adervis.ru' }); }, [DEMO_LEAD, DEMO_BRIEF]);
await page.evaluate(() => {
  const st = window.__STATE__, d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }, at = new Date().toISOString();
  const add = (t, o) => st[t].push({ ...o, _at: at, _by: 'artem@adervis.ru' });
  add('briefs', { id: 'b2', lead_id: '', title: 'Два AI-ролика: Papushevo Park и Президенция Монави', client: 'ООО «ДСК ГРУПП»', stage: 'КП', source_text: '', analysis: {}, questions: [], estimate: { items: [] }, plan: [], kp: { price_full: 750000, price_base: 540000 }, next_step: 'Отправить КП и вопросы', next_on: d(0), updated_at: at });
  add('briefs', { id: 'b3', lead_id: '', title: 'Оформление видеодайджеста «PRO Уралхим»', client: 'Группа компаний «Уралхим»', stage: 'Переговоры', source_text: '', analysis: {}, questions: [], estimate: { items: [] }, plan: [], kp: { price_full: 360000 }, next_step: 'Ждём ответ на КП', next_on: d(1), updated_at: at });
  add('briefs', { id: 'b4', lead_id: '', title: 'UNIX PRO: графика для ролика', client: 'Павел Гринкевич для «Зелинский групп»', stage: 'Переговоры', source_text: '', analysis: {}, questions: [], estimate: { items: [] }, plan: [], kp: { price_full: 200000 }, next_step: 'Получить ответ по смете', next_on: d(1), updated_at: at });
  for (const [t, n] of [['«Битва роботов»: с проектом с 2017 года, снимаем каждый сезон', 0], ['Кто ведёт ваш проект', 1], ['Сколько стоит ролик и из чего складывается цена', 2], ['Отзыв клиента: сотрудничество с ADERVIS', 3], ['Где будет жить ваше видео: площадки и форматы', 4], ['Кейс: ролик для базы отдыха «Раздолье»', 5]])
    add('content', { id: 'c' + n, title: t, channel: 'ВКонтакте', status: 'Черновик', date: d(n), body: '' });
});
await page.click('#refresh'); await page.waitForTimeout(500);
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.querySelector('#nav button[data-page=home]').click(); });
await page.setViewportSize({ width: 1440, height: 900 });
for (const [sel, name] of [['#hubtabs button[data-page=briefs]', 'tip-tab'], ['#refresh', 'tip-refresh'], ['#ask', 'tip-ask']]) {
  await page.hover(sel); await page.waitForTimeout(700);
  const b = await page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await page.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: Math.max(0, b.x - 260), y: Math.max(0, b.y - 90), width: 620, height: 170 } });
}
await browser.close();
server.close();
console.log('ok');
