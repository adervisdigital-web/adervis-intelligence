// Снимок раздела «Сценарии» и PDF сценариев на подменённом API.
// Данные — файл из аргумента (JSON-массив публикаций со статусом «Сценарий»),
// в репозиторий не кладутся. node shot-scenarios.mjs <json> <out-dir>
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const [, , DATA, OUT = path.join(HERE, 'screenshots')] = process.argv;
const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(buf);
  });
});
await new Promise(r => server.listen(0, r));
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.addInitScript(content => {
  const base = { content, members: [{ email: 'owner@example.com', name: 'Владелец' }] };
  window.__INTEL_API__ = new Proxy({
    async user() { return { email: 'owner@example.com' }; },
    async isMember() { return true; },
    async load() { return JSON.parse(JSON.stringify(base)); },
    onSignedOut() {}
  }, { get: (t, k) => k in t ? t[k] : (k === 'pollMs' ? 999999 : async () => ([])) });
  window.print = () => { window.__printed = true; };
}, rows);
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForSelector('#grouprail');
await page.evaluate(() => document.querySelector('#grouprail .gritem[data-page=scenarios]')?.click());
await page.waitForSelector('.sccard');
await page.waitForTimeout(1200);
fs.mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: path.join(OUT, 'scenarios-page.png'), fullPage: true });
await page.click('[data-action=scpdf]');
await page.waitForTimeout(400);
await page.emulateMedia({ media: 'print' });
await page.setViewportSize({ width: 794, height: 1123 });
await page.screenshot({ path: path.join(OUT, 'scenarios-print.png'), fullPage: true });
await page.pdf({ path: path.join(OUT, 'Сценарии.pdf'), format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' } });
await browser.close();
server.close();
console.log('ok', rows.length);
