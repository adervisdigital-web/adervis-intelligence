// Снимки главной и лид-магнитов на пустых данных (без брифов): блок «В работе», плитка «Лучший». Тёмная и светлая тема, ПК и телефон.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..'), OUT = 'C:/tmp/lk2';
const src = fs.readFileSync(path.join(HERE, 'ui.test.mjs'), 'utf8');
const fakeSrc = src.slice(src.indexOf('const fake = (seedData) =>'), src.indexOf('const browser = await chromium.launch()'));
const fake = new Function('return ' + fakeSrc.replace('const fake = ', '').trim().replace(/;$/, ''))();
const seed = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'seed.json'), 'utf8'));
seed.briefs = []; seed.leads = (seed.leads || []).filter(l => l.status !== 'Сделка');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => { const file = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, buf) => { if (err) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(buf); }); });
await new Promise(r => server.listen(0, r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch();
for (const theme of ['dark', 'light']) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }); await ctx.addInitScript(fake, seed);
  await ctx.addInitScript(t => { try { localStorage.setItem('intel_theme', t); } catch {} }, theme);
  const page = await ctx.newPage(); await page.goto(BASE);
  await page.fill('#gate-email', 'artem@adervis.ru'); await page.fill('#gate-pass', 'secret'); await page.click('#gatebtn');
  await page.waitForSelector('#shell:not([hidden])'); await page.evaluate(t => document.documentElement.dataset.theme = t, theme); await page.waitForTimeout(600);
  const money = await page.$('.hmmoney'); if (money) await money.screenshot({ path: `${OUT}/hub_money_${theme}_${w}.png` });
  console.log(theme, w, money ? (await money.textContent()).replace(/\s+/g, ' ').slice(0, 140) : 'нет блока');
  await ctx.close();
}
await browser.close(); server.close();
