// Страница КП для клиента: …/kp.html?t=<токен>. Данные отдаёт функция kp:
// снимок КП из брифа без часов и ставок студии. Всё, что пришло, считаем
// текстом и перед выводом экранируем. Длинных тире в текстах для клиента нет.
(() => {
  const cfg = window.INTEL_CONFIG || {};
  const root = document.getElementById('kp');
  const params = new URLSearchParams(location.search);
  const token = params.get('t') || '';
  // Кто-то из команды (на этом устройстве входили в Hub ADERVIS) открывает
  // КП как просмотр: он не засчитывается, и «Клиент открыл КП» не приходит.
  const team = (() => {
    try { return Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k)) || !!localStorage.getItem('adervis.email'); } catch { return false; }
  })();
  const preview = params.get('p') === '1' || team;

  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rub = n => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₽';
  const day = (iso, opts = { day: 'numeric', month: 'long' }) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', opts) : '';
  const safeUrl = u => /^https:\/\//.test(String(u || '')) ? String(u) : '';
  // «26–27 октября», «30 октября – 2 ноября»
  const range = (a, b) => {
    if (!a || !b || a === b) return day(a || b);
    const [x, y] = [new Date(a + 'T00:00:00'), new Date(b + 'T00:00:00')];
    return x.getMonth() === y.getMonth() ? `${x.getDate()}–${day(b)}` : `${day(a)} – ${day(b)}`;
  };
  // срок этапа в рабочих днях: «2 рабочих дня»; после «около» — «около 28 рабочих дней»
  const workdays = (n, about = false) => `${n} ${about ? plural(n, 'рабочего дня', 'рабочих дней', 'рабочих дней') : plural(n, 'рабочий день', 'рабочих дня', 'рабочих дней')}`;
  const plural = (n, a, b, c) => n % 10 === 1 && n % 100 !== 11 ? a : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? b : c;

  // «## » подзаголовок, «- » пункт, «1. » шаг, «**…**» жирный, пустая строка: абзац
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

  // Примеры: без кнопки «скачать», без перетаскивания и меню по правой кнопке.
  // Полностью защитить файл в браузере нельзя, но случайно сохранить не выйдет.
  function gallery(media) {
    if (!media?.length) return '';
    const groups = [];
    for (const m of media) {
      const url = safeUrl(m.url); if (!url) continue;
      const g = groups.find(x => x.name === (m.group || '')) || (groups.push({ name: m.group || '', items: [] }), groups[groups.length - 1]);
      g.items.push({ ...m, url });
    }
    return `<section id="examples"><div class="wrap"><h2>Как видим оформление</h2>${groups.map(g => `${g.name ? `<p class="group-title">${E(g.name)}</p>` : ''}
      <div class="gallery">${g.items.map((m, i) => `<figure class="${m.kind === 'video' || (g.items.length % 2 && i === 0) ? 'wide' : ''}">
        ${m.kind === 'video'
          ? `<video src="${E(m.url)}"${safeUrl(m.poster) ? ` poster="${E(m.poster)}"` : ''} controls controlslist="nodownload noplaybackrate noremoteplayback" disablepictureinpicture disableremoteplayback playsinline muted loop preload="metadata"></video>`
          : `<div class="shot"><img src="${E(m.url)}" alt="${E(m.caption || '')}" loading="lazy" draggable="false"><span class="shield" aria-hidden="true"></span></div>`}
        ${m.caption ? `<figcaption>${E(m.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`).join('')}</div></section>`;
  }

  // Смета для клиента: переключатель «базовый / полный», галочки у
  // дополнительных работ пересчитывают итог, у строк есть пояснения:
  // на компьютере при наведении, на телефоне по нажатию.
  function estimate(e) {
    if (!e?.groups?.length) return '';
    return `<section id="price"><div class="read"><h2>Стоимость</h2><div id="est"></div><div id="choose" class="choose"></div></div></section>`;
  }

  function mountEstimate(e, d) {
    const box = document.getElementById('est');
    if (!box) return;
    const st = { v: 'full', opts: new Set(), sent: null, budget: false };
    const pick = () => {
      const v = e.two ? st.v : 'full', opts = [...st.opts].sort((a, b) => a - b);
      // в кнопке и подтверждении — короткое название опции: до двоеточия
      const what = [e.two ? (v === 'base' ? 'Базовый вариант' : 'Полный вариант') : 'Смета', ...opts.map(i => String(e.options[i].name).split(':')[0].trim())];
      return { v, opts, what, total: (v === 'base' ? e.base : e.full) + opts.reduce((n, i) => n + (Number(e.options[i].price) || 0), 0) };
    };
    // «Выбрать»: одно нажатие — выбор у нас в Telegram и в Hub. Поменяли
    // вариант или галочки — кнопка возвращается с новой суммой.
    const chooseBox = document.getElementById('choose');
    const drawChoose = () => {
      if (!chooseBox) return;
      const c = pick();
      const who = d.contact ? `${E(d.contact)} свяжется` : 'Мы свяжемся';
      chooseBox.innerHTML = st.sent === 'preview' ? '<p class="chosen">Просмотр команды: ничего не отправлено.</p>'
        : st.sent?.budget ? `<p class="chosen"><b>✓ Ваш бюджет ${rub(st.sent.budget)} отправлен.</b> ${who} с вами: подберём, что можно сделать в эту сумму.</p>`
        : st.sent ? `<p class="chosen"><b>✓ Вы выбрали:</b> ${E(c.what.join(' + '))}, ${rub(c.total)}. ${who} с вами.</p>`
        : `<button type="button" class="btn" data-choose>Выбрать: ${E(c.what.join(' + '))}, ${rub(c.total)}</button>
           <small>Нажмите, и мы получим ваш выбор. Обязательств это не создаёт: дальше обсудим договор.</small>
           ${st.budget ? `<div class="budget"><label for="budgetin">Ваш бюджет, ₽</label>
             <div class="budgetrow"><input id="budgetin" inputmode="numeric" autocomplete="off" maxlength="16" placeholder="Например, 300 000">
             <button type="button" class="btn" data-budgetsend>Отправить</button></div></div>`
           : '<button type="button" class="linkbtn" data-budget>Предложить свой бюджет</button>'}
           <p class="chooseerr" role="alert"></p>`;
    };
    const post = async payload => {
      const r = await fetch(`${cfg.supabaseUrl}/functions/v1/kp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey }, body: JSON.stringify({ token, preview, ...payload })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Не отправилось. Проверьте интернет и попробуйте ещё раз или позвоните нам.');
      return j;
    };
    chooseBox?.addEventListener('input', ev => {
      // 300000 → «300 000» прямо при вводе
      if (ev.target.id !== 'budgetin') return;
      const digits = ev.target.value.replace(/\D/g, '').slice(0, 10);
      ev.target.value = digits ? Number(digits).toLocaleString('ru-RU') : '';
    });
    chooseBox?.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'budgetin') chooseBox.querySelector('[data-budgetsend]')?.click(); });
    chooseBox?.addEventListener('click', async ev => {
      if (ev.target.closest('[data-budget]')) { st.budget = true; drawChoose(); chooseBox.querySelector('#budgetin')?.focus(); return; }
      const btn = ev.target.closest('[data-choose], [data-budgetsend]');
      if (!btn) return;
      const err = chooseBox.querySelector('.chooseerr');
      try {
        if (btn.matches('[data-budgetsend]')) {
          const amount = Number(chooseBox.querySelector('#budgetin').value.replace(/\D/g, ''));
          if (amount < 1000) { err.textContent = 'Укажите сумму в рублях, например 300 000'; return; }
          btn.disabled = true;
          const j = await post({ action: 'budget', amount });
          st.sent = j.preview ? 'preview' : { budget: j.amount };
        } else {
          btn.disabled = true;
          const c = pick();
          const j = await post({ action: 'choose', variant: c.v, options: c.opts });
          st.sent = j.preview ? 'preview' : 'ok';
        }
        drawChoose();
      } catch (e) {
        btn.disabled = false;
        err.textContent = e.message;
      }
    });
    const hints = e.groups.some(g => g.rows.some(r => r.hint));
    const draw = focus => {
      const v = e.two ? st.v : 'full';
      const extra = [...st.opts].reduce((n, i) => n + (Number(e.options?.[i]?.price) || 0), 0);
      const total = (v === 'base' ? e.base : e.full) + extra;
      const row = r => {
        const p = r[v], off = p === null || p === undefined;
        return `<tr class="${off ? 'off' : ''}${r.hint ? ' has' : ''}"${r.hint ? ' tabindex="0"' : ''}>
          <td><span class="nm">${E(r.name)}</span>${r.hint ? `<span class="tip">${E(r.hint)}</span>` : ''}</td>
          <td class="num">${off ? '<span class="offl">не входит</span>' : rub(p)}</td></tr>`;
      };
      box.innerHTML = `
        ${e.two ? `<div class="variants" role="radiogroup" aria-label="Вариант сметы">
          ${[['base', 'Базовый', e.base], ['full', 'Полный', e.full]].map(([k, t, p]) => `<button type="button" role="radio" aria-checked="${v === k}" data-v="${k}"><span>${t} вариант</span><b>${rub(p)}</b></button>`).join('')}
        </div>` : ''}
        ${hints ? '<p class="esthelp">Наведите на строку или нажмите на неё: появится пояснение, что входит в работу.</p>' : ''}
        <table class="est"><thead><tr><th>Работа</th><th class="num">Стоимость</th></tr></thead><tbody>
          ${e.groups.map(g => `<tr class="grp"><td colspan="2">${E(g.name)}</td></tr>${g.rows.map(row).join('')}
            ${e.subtotals ? `<tr class="sub"><td>Итого «${E(g.name)}»</td><td class="num">${rub(g.sum?.[v])}</td></tr>` : ''}`).join('')}
        </tbody><tfoot><tr><td>Итого${extra ? '<small>с дополнительными работами</small>' : ''}</td><td class="num">${rub(total)}</td></tr></tfoot></table>
        ${e.options?.length ? `<h3>Дополнительно, по желанию</h3><p class="esthelp">Отметьте, что хотите добавить, и итог пересчитается.</p>
          <ul class="opts">${e.options.map((o, i) => `<li><label><input type="checkbox" data-o="${i}"${st.opts.has(i) ? ' checked' : ''}>
            <span>${E(o.name)}${o.why ? `<small>${E(o.why)}</small>` : ''}</span><b class="num">+ ${rub(o.price)}</b></label></li>`).join('')}</ul>` : ''}`;
      if (focus) box.querySelector(focus)?.focus();
      st.sent = null; st.budget = false; drawChoose();
    };
    box.addEventListener('click', ev => {
      const vb = ev.target.closest('[data-v]');
      if (vb) { st.v = vb.dataset.v; draw(`[data-v=${st.v}]`); return; }
      ev.target.closest('tr.has')?.classList.toggle('open');
    });
    box.addEventListener('keydown', ev => {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('tr.has')) { ev.preventDefault(); ev.target.classList.toggle('open'); }
    });
    box.addEventListener('change', ev => {
      const i = ev.target.dataset?.o;
      if (i === undefined) return;
      ev.target.checked ? st.opts.add(Number(i)) : st.opts.delete(Number(i));
      draw(`[data-o="${i}"]`);
    });
    draw();
  }

  function render(d) {
    document.title = `${d.title} · ADERVIS`;
    const e = d.estimate || {};
    const price = e.two ? `от ${rub(e.base)}` : rub(e.full);
    const phone = String(d.phone || '').split(/[·,;]/)[0].trim();
    const tel = phone.replace(/[^\d+]/g, '');
    const media = d.media || [];
    // обложка в шапке: кадр первого примера (обложка видео или картинка)
    const first = media.find(m => safeUrl(m.kind === 'video' ? m.poster : m.url));
    const cover = first ? { src: safeUrl(first.kind === 'video' ? first.poster : first.url), video: first.kind === 'video' } : null;
    root.innerHTML = `
    <header class="hero"><div class="wrap">
      <div class="top"><img src="brand/logo.svg" alt="ADERVIS"><span>Коммерческое предложение · ${E(day(d.date, { day: 'numeric', month: 'long', year: 'numeric' }))}</span></div>
      <div class="herogrid${cover ? ' withcover' : ''}"><div class="herotext">
      <h1>${E(d.title)}</h1>
      ${d.client ? `<p class="for">Для: <b>${E(d.client)}</b></p>` : ''}</div>
      ${cover ? `<a class="cover" href="#examples" aria-label="Смотреть примеры оформления"><img src="${E(cover.src)}" alt="" draggable="false">
        <span>${cover.video ? '▶ ' : ''}Смотреть примеры</span></a>` : ''}</div>
      <div class="facts">
        <div><small>Стоимость</small><b class="gold">${E(price)}</b></div>
        <div><small>Срок</small><b>${d.days ? `~${d.days} ${plural(d.days, 'рабочий день', 'рабочих дня', 'рабочих дней')}` : 'по плану'}</b></div>
        ${d.prepay ? `<div><small>Оплата</small><b>${d.prepay}% + ${100 - d.prepay}%</b><small class="sub">до старта и после сдачи</small></div>` : ''}
      </div>
      ${d.intro ? `<p class="intro">${E(d.intro)}</p>` : ''}
    </div></header>
    ${gallery(media)}
    ${d.style ? `<section><div class="read"><h2>Стиль</h2>${richText(d.style)}</div></section>` : ''}
    ${d.concept ? `<section><div class="read"><h2>Концепция и сюжет</h2>${richText(d.concept)}</div></section>` : ''}
    ${d.deliverables?.length ? `<section><div class="read"><h2>Что сделаем</h2><ul class="deliver">${d.deliverables.map(x => `<li><b>${E(x.name)}</b>${x.details ? `<span>${E(x.details)}</span>` : ''}</li>`).join('')}</ul></div></section>` : ''}
    ${d.approach ? `<section><div class="read"><h2>Как будем делать</h2>${richText(d.approach)}</div></section>` : ''}
    ${estimate(e)}
    ${d.plan?.length ? `<section><div class="read"><h2>Этапы и сроки</h2><ol class="plan">${d.plan.map(s => `<li><b>${E(s.stage)}</b>
      <small>${s.days ? E(workdays(s.days)) : E(range(s.from, s.to))}</small>${s.result ? `<span>${E(s.result)}</span>` : ''}</li>`).join('')}</ol>
      ${d.days ? `<p class="plantotal">Итого: около ${E(workdays(d.days, true))}</p>` : ''}</div></section>` : ''}
    ${d.terms?.length ? `<section><div class="read"><h2>Условия</h2><ul>${d.terms.map(t => `<li>${E(t)}</li>`).join('')}</ul></div></section>` : ''}
    ${d.refs?.length ? `<section><div class="read"><h2>Наши работы</h2><ul>${d.refs.map(r => safeUrl(r.url) ? `<li><a href="${E(r.url)}" target="_blank" rel="noopener noreferrer">${E(r.name || r.url)}</a></li>` : `<li>${E(r.name)}</li>`).join('')}</ul></div></section>` : ''}
    ${d.why?.length ? `<section><div class="read"><h2>Почему ADERVIS</h2><ul>${d.why.map(w => `<li>${E(w)}</li>`).join('')}</ul></div></section>` : ''}
    <footer class="cta"><div class="read">
      <h2>Обсудим?</h2>
      <p>${d.contact ? `${E(d.contact)}, ADERVIS. ` : ''}Ответим на вопросы и покажем, как начнём работу.</p>
      ${tel ? `<a class="btn" href="tel:${E(tel)}">Позвонить ${E(phone)}</a>` : ''}
      <button type="button" class="btn ghost" id="pdfbtn">Скачать PDF</button>
      <a class="btn ghost" href="https://adervis.ru" target="_blank" rel="noopener noreferrer">adervis.ru</a>
    </div></footer>
    ${tel ? `<div class="bar"><a class="btn" href="tel:${E(tel)}">Позвонить</a></div>` : ''}`;
    if (preview) root.insertAdjacentHTML('afterbegin', '<p class="teamnote">Просмотр команды: клиенту не засчитан, уведомление не придёт</p>');
    mountEstimate(e, d);
    document.getElementById('pdfbtn')?.addEventListener('click', () => window.print());
    root.querySelectorAll('.gallery img, .gallery video, .gallery .shield, .cover img').forEach(el => {
      el.addEventListener('contextmenu', ev => ev.preventDefault());
      el.addEventListener('dragstart', ev => ev.preventDefault());
    });
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
