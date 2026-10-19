// Снимки нового меню для глазной проверки: тёмная и светлая тема, свёрнутое меню.
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
const seed = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'local-0.3', 'adervis-seed.json'), 'utf8'));

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
for (const [theme, pageId] of [['dark', 'leads'], ['light', 'content']]) {
  await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
  await page.evaluate(id => document.querySelector(`#nav button[data-page=${id}]`).click(), pageId);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `nav-${theme}.png`) });
}
await page.click('#rail');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'nav-rail.png') });
await browser.close();
server.close();
console.log('ok');
