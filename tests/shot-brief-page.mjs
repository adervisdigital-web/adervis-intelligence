// Снимки брифа: услуги, вопрос, несколько ответов, проверка — с телефона и компьютера.
//   node shot-brief-page.mjs <адрес> <папка>   (адрес: локальный сервер из корня intel)
import { chromium } from 'playwright-core';
const [base, out] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'msedge' });
for (const [w, h, tag] of [[390, 844, 'ph'], [1440, 900, 'pc']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: tag === 'ph' ? 2 : 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + '/brief.html?src=tg'); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/bf-${tag}-1.png` });
  await p.click('.tile[data-id=ai]'); await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/bf-${tag}-2.png` });
  await p.click('.opt >> nth=0'); await p.waitForTimeout(800);
  await p.fill('#ta', 'Набор уходовой косметики 50+ для магазина в Instagram'); await p.click('[data-act=next]'); await p.waitForTimeout(500);
  await p.click('[data-act=skip]'); await p.waitForTimeout(500);
  await p.click('.opt >> nth=1'); await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/bf-${tag}-3.png` });
  await p.click('.opt >> nth=1'); await p.waitForTimeout(800); await p.click('.opt >> nth=3'); await p.waitForTimeout(800); await p.click('.opt >> nth=4'); await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/bf-${tag}-4.png`, fullPage: true });
  await p.click('[data-act=edit][data-i="3"]'); await p.waitForTimeout(600); await p.click('.opt >> nth=2'); await p.waitForTimeout(900);
  console.log(tag, 'после правки снова проверка:', await p.isVisible('.rev'), '| ошибки:', errs.join(' | ') || 'нет');
  await p.close();
}
await b.close();
