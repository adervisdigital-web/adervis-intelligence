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
const OUTV = process.argv[2];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
await page.route('**/functions/v1/kp', async r => {
  const b = JSON.parse(r.request().postData() || '{}');
  if (b.action) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, preview: false }) });
  const res = await r.fetch({ postData: JSON.stringify({ ...b, preview: true }) });
  const j = await res.json(); j.data.date = '2026-09-01'; j.data.valid = 14;
  return r.fulfill({ contentType: 'application/json', body: JSON.stringify(j) });
});
await page.goto(BASE + 'kp.html?t=BhjD9U6xSdY9mbpfBGYtbSW8');
await page.waitForSelector('.hero h1');
await page.evaluate(() => document.querySelectorAll('.teamnote').forEach(e => e.remove()));
await page.evaluate(() => document.querySelector('.expired').scrollIntoView({ block: 'start' }));
await page.waitForTimeout(500);
await page.screenshot({ path: process.argv[2] + '/1-устарело-плашка.png' });
await page.evaluate(() => document.querySelector('#choose').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(500);
await page.screenshot({ path: process.argv[2] + '/2-обновить-предложение.png' });
await page.click('[data-renew]'); await page.waitForTimeout(1600);
await page.screenshot({ path: process.argv[2] + '/3-запрос-отправлен.png' });
await ctx.close();
await browser.close();
server.close();
console.log('ok');
