// Снимки страницы брифа: выбор задачи и форма AI-ролика, с телефона.
//   node shot-brief-page.mjs <адрес> <папка>   (адрес: локальный сервер из корня intel)
import { chromium } from 'playwright-core';
const [base, out] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
for (const [q, name] of [['', 'brief-types'], ['?t=ai&src=tg', 'brief-ai']]) {
  await p.goto(base + '/brief.html' + q); await p.waitForTimeout(600);
  if (name === 'brief-ai') { await p.locator('.chip span', { hasText: '30 секунд' }).click(); await p.locator('.chip span', { hasText: 'Instagram, Reels' }).click(); }
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
await p.locator('.send').click(); await p.waitForTimeout(200);
console.log('ошибка формы:', await p.locator('#err').textContent());
await b.close();
