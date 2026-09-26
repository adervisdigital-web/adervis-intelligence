// Комплект для соцсетей из элементов брендбука: паттерн, знак, единый набор
// иконок, фирменные шрифты, цвета услуг с сайта. Цены и описания услуг —
// с сайта adervis.ru (services.json), здесь не придумываются.
//
// Запуск из intel/tests (там стоит playwright-core):
//   node ../tools/social/build.mjs
// Шрифты берутся из установленных в системе (Eurostile Extended, TT Fors);
// если их нет — из свободных запасных в intel/fonts.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
// playwright-core стоит в intel/tests — берём его оттуда, а не рядом со скриптом.
const { chromium } = createRequire(path.join(ROOT, 'tests', 'package.json'))('playwright-core');
const OUT = path.join(ROOT, 'brand', 'social');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const services = JSON.parse(fs.readFileSync(path.join(HERE, 'services.json'), 'utf8'));
const iconsSrc = fs.readFileSync(path.join(ROOT, 'icons-data.js'), 'utf8');
const icons = Object.fromEntries(JSON.parse(iconsSrc.slice(iconsSrc.indexOf('['), iconsSrc.lastIndexOf(']') + 1)).map(i => [i.key, i]));

// Паттерн — тот же код, что в приложении, без копирования логики.
const markPath = app.match(/const MARK_PATH = '[^']+'/)[0];
const block = app.slice(app.indexOf("const PATTERN_BG = '#090909';"), app.indexOf('function patternFile(id) {'));
const { PATTERN_VARIANTS, patternSvg, MARK_OUTER, MARK_HOLE } =
  new Function('E', `${markPath}\n${block}\nreturn { PATTERN_VARIANTS, patternSvg, MARK_OUTER, MARK_HOLE };`)(s => String(s));
const logo = fs.readFileSync(path.join(ROOT, 'brand', 'logo.svg'), 'utf8').replace(/<\?xml[^>]*>/, '');

const SYS = 'C:/Users/MSI/AppData/Local/Microsoft/Windows/Fonts';
const face = (fam, file, fallback, w) => {
  const local = path.join(SYS, file);
  const url = fs.existsSync(local) ? pathToFileURL(local).href : pathToFileURL(path.join(ROOT, 'fonts', fallback)).href;
  return `@font-face{font-family:'${fam}';font-weight:${w};src:url('${url}')}`;
};
const FONTS = [
  face('Display', 'Eurostile Extended-Black.ttf', 'unbounded-700-cyrillic.woff2', 900),
  face('Display', 'Eurostile Extended-Medium.ttf', 'unbounded-500-cyrillic.woff2', 500),
  face('Text', 'TT Fors Regular.ttf', 'golostext-400-cyrillic.woff2', 400),
  face('Text', 'TT Fors Bold.ttf', 'golostext-600-cyrillic.woff2', 700)
].join('');

const GOLD = '#f6bd3a';
// Цвета услуг — те же, что на сайте (css/style.css: --c-video, --c-design, --c-photo).
const DIR = { 'Видео': '#f52424', 'Дизайн': '#7733ff', 'Фото': '#f5b72b' };
const SERVICE_ICON = {
  'Логотип': 'logo', 'Фирменный стиль': 'identity', 'Брендбук': 'knowledge', 'Редизайн': 'refresh',
  'Предметная съёмка': 'packshot', 'Портреты команды': 'portrait', 'Контент-серия': 'social',
  'Репортаж с мероприятия': 'photo', 'Рекламный ролик': 'video', 'Видео о компании': 'shooting',
  'Съёмка мероприятия': 'event', 'Анимация и моушн': 'animation'
};
const SLUG = {
  'Логотип': 'logo', 'Фирменный стиль': 'identity', 'Брендбук': 'brandbook', 'Редизайн': 'redesign',
  'Предметная съёмка': 'packshot', 'Портреты команды': 'portraits', 'Контент-серия': 'content-series',
  'Репортаж с мероприятия': 'photo-report', 'Рекламный ролик': 'promo-video', 'Видео о компании': 'company-film',
  'Съёмка мероприятия': 'event-video', 'Анимация и моушн': 'motion'
};

const ic = (key, size, color = GOLD, weight = 'regular') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 256 256" fill="${color}">${icons[key][weight]}</svg>`;
const bg = (w, h, variant = 'p1') => `<svg class="bg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  ${patternSvg(PATTERN_VARIANTS.find(v => v.id === variant), w, h, variant + w)}</svg>`;
const mark = (size, color = GOLD) => `<svg width="${size}" height="${size}" viewBox="432 412 1297 1269">
  <path fill="${color}" fill-rule="evenodd" d="${MARK_OUTER}${MARK_HOLE}"/></svg>`;
const price = n => 'от ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';

const CSS = `${FONTS}
*{box-sizing:border-box;margin:0}
body{background:#090909;color:#fdfdfd;font-family:Text,sans-serif}
.a{position:relative;overflow:hidden;background:#090909}
.bg{position:absolute;inset:0}
.glow{position:absolute;border-radius:50%;filter:blur(90px);opacity:.22;background:${GOLD}}
.h{font-family:Display,sans-serif;font-weight:900;text-transform:uppercase;line-height:1.02}
.h .g{color:${GOLD}}
.eyebrow{font-weight:700;text-transform:uppercase;letter-spacing:.16em;color:#9a9a9a;display:flex;align-items:center;gap:14px}
.eyebrow i{width:14px;height:14px;border-radius:50%;display:inline-block}
.p{color:#bdbdbd;line-height:1.45}
.pill{display:inline-flex;align-items:center;border:2px solid ${GOLD};border-radius:999px;font-weight:700;color:#fdfdfd}
.foot{position:absolute;display:flex;align-items:center;justify-content:space-between}
.foot span{color:#8d8d8d;font-weight:700;letter-spacing:.08em}
.logo svg{height:100%;width:auto;display:block}`;

const card = s => {
  const W = 1080, H = 1080;
  // Первое слово золотом, остальное белым — как в карточках 2022 года.
  // «Контент-серия» без пробела делим по дефису, иначе она целиком золотая.
  const cut = s.name.includes(' ') ? s.name.indexOf(' ') : s.name.includes('-') ? s.name.indexOf('-') + 1 : s.name.length;
  const first = s.name.slice(0, cut).trim(), rest = s.name.slice(cut).trim();
  return { name: `services/${SLUG[s.name] || s.name}`, w: W, h: H, html: `<div class="a" style="width:${W}px;height:${H}px">
    ${bg(W, H, 'p5')}
    <div class="glow" style="width:520px;height:520px;right:-120px;top:-140px"></div>
    <div style="position:absolute;right:92px;top:92px">${ic(SERVICE_ICON[s.name] || 'star', 150)}</div>
    <div style="position:absolute;left:92px;top:104px">
      <div class="eyebrow" style="font-size:22px"><i style="background:${DIR[s.dir]}"></i>${s.dir}</div>
    </div>
    <div style="position:absolute;left:92px;right:92px;top:320px">
      <div class="h" style="font-size:${s.name.length > 16 ? 72 : 84}px"><span class="g">${first}</span>${rest ? '<br>' + rest : ''}</div>
      <p class="p" style="font-size:31px;margin-top:40px;max-width:860px">${s.desc}</p>
    </div>
    <div style="position:absolute;left:92px;bottom:150px"><span class="pill" style="font-size:34px;padding:18px 34px">${price(s.price)}</span></div>
    <div class="foot" style="left:92px;right:92px;bottom:72px;height:34px">
      <div class="logo" style="height:34px">${logo}</div><span style="font-size:22px">ADERVIS.RU</span></div>
  </div>` };
};

const MENU = [['consult', 'Консультация', 'chat'], ['video', 'Видео', 'play'], ['reviews', 'Отзывы', 'star'],
  ['cases', 'Кейсы', 'cases'], ['bonus', 'Бонус', 'gift'], ['contract', 'Договор', 'contract']];

const TAG = 'Видео · Дизайн · Фото · ИИ-контент — для бизнеса';
const assets = [
  { name: 'avatar', w: 1000, h: 1000, html: `<div class="a" style="width:1000px;height:1000px">${bg(1000, 1000, 'p1')}
      <div class="glow" style="width:640px;height:640px;left:180px;top:180px;opacity:.26"></div>
      <div style="position:absolute;inset:0;display:grid;place-items:center">${mark(540)}</div></div>` },
  { name: 'vk-cover', w: 1920, h: 768, html: `<div class="a" style="width:1920px;height:768px">${bg(1920, 768, 'p1')}
      <div class="glow" style="width:900px;height:900px;left:510px;top:-200px;opacity:.16"></div>
      <div style="position:absolute;left:0;right:0;top:190px;display:flex;flex-direction:column;align-items:center;gap:40px">
        <div class="logo" style="height:150px">${logo}</div>
        <div class="p" style="font-size:36px;color:#cfcfcf">${TAG}</div>
      </div></div>` },
  { name: 'youtube-banner', w: 2560, h: 1440, html: `<div class="a" style="width:2560px;height:1440px">${bg(2560, 1440, 'p1')}
      <div class="glow" style="width:1100px;height:1100px;left:730px;top:170px;opacity:.14"></div>
      <div style="position:absolute;left:507px;top:508px;width:1546px;height:423px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:34px">
        <div class="logo" style="height:170px">${logo}</div>
        <div class="p" style="font-size:40px;color:#cfcfcf">${TAG}</div>
      </div></div>` },
  ...MENU.map(([slugName, label, key]) => ({ name: `vk-menu/${slugName}`, w: 376, h: 256, html:
    `<div class="a" style="width:376px;height:256px">${bg(376, 256, 'p6')}
      <div class="glow" style="width:220px;height:220px;left:78px;top:-10px;opacity:.2"></div>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px">
        ${ic(key, 84)}
        <div style="font-family:Display,sans-serif;font-weight:500;font-size:19px;text-transform:uppercase;letter-spacing:.06em">${label}</div>
      </div></div>` })),
  ...services.map(card)
];

fs.mkdirSync(path.join(OUT, 'services'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'vk-menu'), { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ deviceScaleFactor: 1 });
const report = [];
for (const a of assets) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: a.w, height: a.h });
  const file = path.join(OUT, '_render.html');
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${a.html}`);
  await p.goto(pathToFileURL(file).href);
  await p.evaluate(() => document.fonts.ready);
  const used = await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight));
  await p.screenshot({ path: path.join(OUT, a.name + '.png'), clip: { x: 0, y: 0, width: a.w, height: a.h } });
  report.push({ name: a.name, size: `${a.w}×${a.h}`, fonts: used });
  console.log(a.name.padEnd(28), `${a.w}×${a.h}`, used.join(', '));
  await p.close();
}
fs.unlinkSync(path.join(OUT, '_render.html'));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(report.map(r => ({ name: r.name, size: r.size })), null, 1));
await b.close();
