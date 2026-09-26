// Раскладывает знак на точки: отверстие и внешний силуэт отдельно.
// Запуск из intel/tests (там стоит playwright-core):
//   node ../tools/patterns/sample-mark.mjs ../tools/patterns/mark-points.json
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const d = fs.readFileSync('../app.js', 'utf8').match(/const MARK_PATH = '([^']+)'/)[1];
const [hole, outer] = d.split(/(?=M)/);
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
await p.setContent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2160 2160"><path id="h" d="${hole}"/><path id="o" d="${outer}"/></svg>`);
const pts = await p.evaluate(() => {
  const take = (id, n) => { const e = document.getElementById(id), L = e.getTotalLength();
    return Array.from({ length: n }, (_, i) => { const q = e.getPointAtLength(L * i / n); return [+q.x.toFixed(2), +q.y.toFixed(2)]; }); };
  return { hole: take('h', 1400), outer: take('o', 1600) };
});
fs.writeFileSync(process.argv[2], JSON.stringify(pts));
await b.close();
