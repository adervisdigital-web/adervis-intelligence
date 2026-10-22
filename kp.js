// Страница КП для клиента: …/kp.html?t=<токен>. Данные отдаёт функция kp —
// снимок КП из брифа без часов и ставок студии. Всё, что пришло, — текст:
// перед выводом экранируется.
(() => {
  const cfg = window.INTEL_CONFIG || {};
  const root = document.getElementById('kp');
  const params = new URLSearchParams(location.search);
  const token = params.get('t') || '';
  const preview = params.get('p') === '1';

  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rub = n => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₽';
  const day = (iso, opts = { day: 'numeric', month: 'long' }) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', opts) : '';
  const safeUrl = u => /^https:\/\//.test(String(u || '')) ? String(u) : '';
  const plural = (n, a, b, c) => n % 10 === 1 && n % 100 !== 11 ? a : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? b : c;

  // «## » подзаголовок, «- » пункт, «1. » шаг, «**…**» жирный, пустая строка — абзац
  function richText(text) {
    const inline = x => E(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    return String(text || '').split(/\n{2,}/).map(block => {
      const out = []; let list = null;
      const close = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
      for (const l of block.split('\n').map(x => x.trim()).filter(Boolean)) {
        const ul = /^[-—•]\s+(.*)$/.exec(l), ol = /^\d+[.)]\s+(.*)$/.exec(l), h = /^#{2,3}\s+(.*)$/.exec(l);
        if (h) { close(); out.push(`<h3>${inline(h[1])}</h3>`); }
        else if (ul || ol) { const tag = ul ? 'ul' : 'ol'; if (list?.tag !== tag) { close(); list = { tag, items: [] }; } list.items.push((ul || ol)[1]); }
        else { close(); out.push(`<p>${inline(l)}</p>`); }
      }
      close(); return out.join('');
    }).join('');
  }

  function gallery(media) {
    if (!media?.length) return '';
    const groups = [];
    for (const m of media) {
      const url = safeUrl(m.url); if (!url) continue;
      const g = groups.find(x => x.name === (m.group || '')) || (groups.push({ name: m.group || '', items: [] }), groups[groups.length - 1]);
      g.items.push({ ...m, url });
    }
    return `<section><div class="wrap"><h2>Как видим оформление</h2>${groups.map(g => `${g.name ? `<p class="group-title">${E(g.name)}</p>` : ''}
      <div class="gallery">${g.items.map((m, i) => `<figure class="${m.kind === 'video' || (g.items.length % 2 && i === 0) ? 'wide' : ''}">
        ${m.kind === 'video' ? `<video src="${E(m.url)}" controls playsinline muted loop preload="metadata"></video>` : `<img src="${E(m.url)}" alt="${E(m.caption || '')}" loading="lazy">`}
        ${m.caption ? `<figcaption>${E(m.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`).join('')}</div></section>`;
  }

  function estimate(e) {
    if (!e?.groups?.length) return '';
    const two = !!e.two, cols = two ? 3 : 2, money = v => v === null || v === undefined ? '—' : rub(v);
    const rows = e.groups.map(g => `<tr class="grp"><td colspan="${cols}">${E(g.name)}</td></tr>` + g.rows.map(r => `<tr><td>${E(r.name)}</td>
        ${two ? `<td class="num">${money(r.base)}</td>` : ''}<td class="num">${money(r.full)}</td></tr>`).join('')
      + (e.subtotals ? `<tr class="sub"><td>Итого «${E(g.name)}»</td>${two ? `<td class="num">${rub(g.sum?.base)}</td>` : ''}<td class="num">${rub(g.sum?.full)}</td></tr>` : '')).join('');
    return `<section><div class="read"><h2>Стоимость</h2>
      <div class="est-wrap"><table class="est"><thead><tr><th>Работа</th>${two ? '<th class="num">Базовый</th><th class="num">Полный</th>' : '<th class="num">Стоимость</th>'}</tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td>Итого</td>${two ? `<td class="num">${rub(e.base)}</td>` : ''}<td class="num">${rub(e.full)}</td></tr></tfoot></table></div>
      ${e.options?.length ? `<h3>Дополнительно, по желанию</h3><ul class="opts">${e.options.map(o => `<li><span>${E(o.name)}${o.why ? `<small>${E(o.why)}</small>` : ''}</span><b class="num">+ ${rub(o.price)}</b></li>`).join('')}</ul>` : ''}
    </div></section>`;
  }

  function render(d) {
    document.title = `${d.title} — предложение ADERVIS`;
    const e = d.estimate || {};
    const price = e.two ? `от ${rub(e.base)}` : rub(e.full);
    const phone = String(d.phone || '').split(/[·,;]/)[0].trim();
    const tel = phone.replace(/[^\d+]/g, '');
    const media = d.media || [];
    root.innerHTML = `
    <header class="hero"><div class="wrap">
      <div class="top"><img src="brand/logo.svg" alt="ADERVIS"><span>Коммерческое предложение · ${E(day(d.date, { day: 'numeric', month: 'long', year: 'numeric' }))}</span></div>
      <h1>${E(d.title)}</h1>
      ${d.client ? `<p class="for">Для: <b>${E(d.client)}</b></p>` : ''}
      <div class="facts">
        <div><small>Стоимость</small><b class="gold">${E(price)}</b></div>
        <div><small>Срок</small><b>${d.days ? `${d.days} ${plural(d.days, 'рабочий день', 'рабочих дня', 'рабочих дней')}` : 'по плану'}</b></div>
        <div><small>Предложение действует до</small><b>${E(day(d.valid_until))}</b></div>
      </div>
      ${d.intro ? `<p class="intro">${E(d.intro)}</p>` : ''}
    </div></header>
    ${gallery(media)}
    ${d.style ? `<section><div class="read"><h2>Стиль</h2>${richText(d.style)}</div></section>` : ''}
    ${d.concept ? `<section><div class="read"><h2>Концепция и сюжет</h2>${richText(d.concept)}</div></section>` : ''}
    ${d.deliverables?.length ? `<section><div class="read"><h2>Что сделаем</h2><ul>${d.deliverables.map(x => `<li><b>${E(x.name)}</b>${x.details ? ` — ${E(x.details)}` : ''}</li>`).join('')}</ul></div></section>` : ''}
    ${d.approach ? `<section><div class="read"><h2>Как будем делать</h2>${richText(d.approach)}</div></section>` : ''}
    ${estimate(e)}
    ${d.plan?.length ? `<section><div class="read"><h2>Этапы и сроки</h2><ol class="plan">${d.plan.map(s => `<li><b>${E(s.stage)}</b>
      <small>${E(day(s.from))} — ${E(day(s.to))}${s.result ? ` · ${E(s.result)}` : ''}</small></li>`).join('')}</ol></div></section>` : ''}
    ${d.terms?.length ? `<section><div class="read"><h2>Условия</h2><ul>${d.terms.map(t => `<li>${E(t)}</li>`).join('')}</ul></div></section>` : ''}
    ${d.refs?.length ? `<section><div class="read"><h2>Наши работы</h2><ul>${d.refs.map(r => `<li>${E(r.name)}${safeUrl(r.url) ? ` — <a href="${E(r.url)}" target="_blank" rel="noopener noreferrer">${E(r.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : ''}</li>`).join('')}</ul></div></section>` : ''}
    ${d.why?.length ? `<section><div class="read"><h2>Почему ADERVIS</h2><ul>${d.why.map(w => `<li>${E(w)}</li>`).join('')}</ul></div></section>` : ''}
    <footer class="cta"><div class="read">
      <h2>Обсудим?</h2>
      <p>${d.contact ? `${E(d.contact)}, ADERVIS. ` : ''}Ответим на вопросы и покажем, как начнём работу.</p>
      ${tel ? `<a class="btn" href="tel:${E(tel)}">Позвонить ${E(phone)}</a>` : ''}
      <a class="btn ghost" href="https://adervis.ru" target="_blank" rel="noopener noreferrer">adervis.ru</a>
      <p class="valid">Предложение действует до ${E(day(d.valid_until))}.</p>
    </div></footer>
    ${tel ? `<div class="bar"><a class="btn" href="tel:${E(tel)}">Позвонить</a></div>` : ''}`;
  }

  async function load() {
    if (!token) { fail('Ссылка неполная', 'Проверьте, что скопировали её целиком.'); return; }
    try {
      const r = await fetch(`${cfg.supabaseUrl}/functions/v1/kp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey },
        body: JSON.stringify({ token, preview })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.data) { fail('Предложение недоступно', j.error || 'Попробуйте открыть ссылку ещё раз.'); return; }
      render(j.data);
    } catch { fail('Нет связи', 'Проверьте интернет и обновите страницу.'); }
  }
  function fail(title, text) { root.innerHTML = `<div class="kp-error"><h1>${E(title)}</h1><p>${E(text)}</p></div>`; }
  window.__KP_RENDER__ = render;   // для проверки вёрстки в тестах
  load();
})();
