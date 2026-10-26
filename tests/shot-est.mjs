// Снимки страницы брифа для глазной проверки: тёмная и светлая тема, свёрнутое меню.
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
  estimate: { reserve: 10, round: 5000, items: [
  { group: 'Подготовка сезона', name: 'Библия сериала: мир, тон, правила, 4–6 героев', hint: 'Документ, по которому живёт весь сезон', role: 'art', min: 16, max: 20, variant: 'both' },
  { group: 'Подготовка сезона', name: 'Арка сезона и логлайны 60 серий', hint: 'Сюжет сезона целиком и описание каждой серии', role: 'art', min: 14, max: 18, variant: 'both' },
  { group: 'Подготовка сезона', name: 'Дизайн героев и локаций, листы для ИИ', hint: 'Внешность героев со всех сторон', role: '3d', min: 24, max: 30, variant: 'both' },
  { group: 'Подготовка сезона', name: 'Управление проектом: подготовка', hint: 'План сезона, график выхода', role: 'motion', min: 8, max: 12, variant: 'both', fold: true },
  { group: 'Производство 60 серий по 60 секунд', name: 'Генерация и монтаж серий', hint: '', role: 'motion', min: 120, max: 160, variant: 'both' },
  { group: 'Производство 60 серий по 60 секунд', name: 'Голоса героев', hint: 'Подбор и запись', role: 'sound', min: 30, max: 40, variant: 'full' },
  { group: 'Производство 60 серий по 60 секунд', name: 'Музыка: библиотека', hint: '', role: 'sound', min: 10, max: 14, variant: 'base' },
  { group: 'Сопровождение', name: 'Обложки и тизеры', hint: '', role: 'motion', min: 20, max: 26, variant: 'both' }
], options: [{ name: 'Английская версия', why: 'дубляж и субтитры', role: 'sound', min: 20, max: 30 }] }, plan: [], kp: {}, next_step: 'Получить ответы и посчитать серию', next_on: '2026-10-24', updated_at: '2026-10-25T10:00:00Z' };

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
await page.click('#refresh'); await page.waitForTimeout(500);
for (const [theme, w, h] of [['dark', 1600, 1000], ['light', 1440, 900], ['dark', 390, 844]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
  await page.evaluate(() => document.querySelector('#nav button[data-page=briefs]').click());
  await page.waitForSelector('.bfcard');
  await page.click('.bfcard');
  await page.waitForSelector('.bftabs');
  await page.click('[data-action=bftab][data-id=estimate]');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.estwrap').scrollIntoView());
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, `est-${theme}-${w}.png`), fullPage: w < 500 });
}
await browser.close();
server.close();
console.log('ok');
