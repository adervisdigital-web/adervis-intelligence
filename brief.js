// Бриф ADERVIS для клиента: hub.adervis.ru/brief.html[?t=video&src=tg]
// Один вопрос на экран, крупные плитки, прогресс и голосовой помощник.
// Вопросы и фразы — brief-data.js. Ответы уходят в функцию brief-intake →
// заявка и бриф в Hub, уведомление менеджеру. В CRM ничего не пишется.
(() => {
  const cfg = window.INTEL_CONFIG || {}, D = window.BRIEF_DATA;
  const ICON = Object.fromEntries((window.ADERVIS_ICONS || []).map(i => [i.key, i]));
  const icon = (k, s = 28) => ICON[k] ? `<svg width="${s}" height="${s}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${ICON[k].regular}</svg>` : '';
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = new URLSearchParams(location.search), src = (P.get('src') || '').slice(0, 10);
  let svc = D.legacy[P.get('t')] || P.get('t');
  if (!D.services.some(s => s.id === svc)) svc = '';
  const root = document.getElementById('brief');
  // цвета услуг и прогресс ставим из скрипта: строгая политика страницы не пускает style="" в разметке
  const paint = () => { root.querySelectorAll('[data-c]').forEach(el => el.style.setProperty('--c', el.dataset.c)); root.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; }); };
  new MutationObserver(paint).observe(root, { childList: true, subtree: true });
  const ans = {}, store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* без памяти */ } };
  let voiceOn = (() => { try { return localStorage.getItem('brief.voice') !== 'off'; } catch (e) { return true; } })();
  let heard = false, step = 0, player = null;

  const steps = () => svc ? [...D.steps[svc], ...D.common, { id: 'contact', kind: 'contact', ...D.contact }] : [];
  const service = () => D.services.find(s => s.id === svc);
  const key = st => st.kind === 'contact' ? 'contact' : D.common.includes(st) ? 'common-' + st.id : `${svc}-${st.id}`;

  // ---- голос: короткие фразы помощника, файлы brief-voice/<ключ>.mp3
  function say(k) {
    if (player) { player.pause(); player = null; }
    if (!voiceOn || !heard) return;
    player = new Audio(`brief-voice/${k}.mp3`);
    player.play().catch(() => {});
  }
  const voiceBtn = () => `<button class="vbtn${voiceOn ? ' on' : ''}" data-act="voice" aria-pressed="${voiceOn}" title="${voiceOn ? 'Выключить голос' : 'Включить голос'}">
    ${icon(voiceOn ? 'sound' : 'voice', 20)}<span>${voiceOn ? 'Голос включён' : 'Голос выключен'}</span></button>`;
  const top = (pct, back) => `<header class="qtop" data-c="${service()?.c || '#F6BD3A'}">
    ${back ? `<button class="back" data-act="back" aria-label="Назад">${icon('back', 22)}</button>` : '<a class="logo" href="https://adervis.ru"><img src="brand/logo-2026.svg" alt="ADERVIS"></a>'}
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i data-w="${pct}"></i></div>${voiceBtn()}</header>`;

  // ---- экран 0: с чем помочь
  function start() {
    root.innerHTML = top(4, false) + `<main class="q fade">
      <p class="kick">Бриф · 2 минуты</p>
      <h1>С чем вам помочь?</h1>
      <p class="lead">Ответы помогут сразу назвать сроки и примерную стоимость.</p>
      ${!heard ? `<button class="hear" data-act="hear">${icon('play', 18)} Заполнять с голосовым помощником</button>` : ''}
      <div class="svc">${D.services.map(s => `<button class="tile" data-act="svc" data-id="${s.id}" data-c="${s.c}">
        <span class="ti">${icon(s.icon, 34)}</span><b>${E(s.t)}</b><small>${E(s.sub)}</small></button>`).join('')}</div></main>`;
  }

  // ---- вопрос
  function show() {
    const list = steps(), st = list[step], pct = Math.round(8 + 92 * step / list.length);
    const v = ans[st.id];
    let body = '';
    if (st.kind === 'one' || st.kind === 'many') {
      const sel = st.kind === 'many' ? (v || []) : [v];
      body = `<div class="opts${st.options.length > 4 ? ' many6' : ''}">${st.options.map(([t, ic]) =>
        `<button class="opt${sel.includes(t) ? ' on' : ''}" data-act="opt" data-v="${E(t)}" aria-pressed="${sel.includes(t)}"><span class="oi">${icon(ic, 26)}</span><b>${E(t)}</b>${st.kind === 'many' ? `<i class="tick">${icon('check', 16)}</i>` : ''}</button>`).join('')}</div>`
        + (st.kind === 'many' ? `<button class="next" data-act="next" ${(v || []).length ? '' : 'disabled'}>Дальше ${icon('next', 18)}</button>` : '');
    } else if (st.kind === 'contact') {
      body = `<div class="fields"><label>Как к вам обращаться?<input id="nm" maxlength="120" autocomplete="name" value="${E(ans.name || '')}"></label>
        <label>Куда написать?<input id="ct" maxlength="200" placeholder="@username, телефон или почта" autocomplete="tel" value="${E(ans.contact || '')}"></label>
        <input class="hp" id="website" tabindex="-1" autocomplete="off" aria-hidden="true"></div>
        <p class="err" id="err" role="alert"></p>
        <button class="next send" data-act="send">Отправить бриф ${icon('send', 18)}</button>`;
    } else {
      body = `<textarea id="ta" rows="4" maxlength="3000" placeholder="${E(st.hint || '')}">${E(v || '')}</textarea>
        <p class="err" id="err" role="alert"></p>
        <div class="row"><button class="next" data-act="next">Дальше ${icon('next', 18)}</button>${st.req ? '' : '<button class="skip" data-act="skip">Пропустить</button>'}</div>`;
    }
    root.innerHTML = top(pct, true) + `<main class="q fade" data-c="${service().c}">
      <p class="kick"><span class="chip">${icon(service().icon, 16)} ${E(service().t)}</span> Вопрос ${step + 1} из ${list.length}</p>
      <h1>${E(st.q)}</h1>${body}</main>`;
    const f = root.querySelector('textarea, #nm'); if (f && matchMedia('(min-width: 721px)').matches) f.focus();
    say(key(st));
  }

  function next() { step++; show(); window.scrollTo(0, 0); }
  async function send() {
    const name = document.getElementById('nm').value.trim(), contact = document.getElementById('ct').value.trim();
    ans.name = name; ans.contact = contact;
    const err = !name ? 'Напишите, как к вам обращаться' : contact.length < 3 ? 'Оставьте контакт, чтобы мы могли ответить' : '';
    document.getElementById('err').textContent = err;
    if (err) return;
    const btn = root.querySelector('.send'); btn.disabled = true; btn.innerHTML = 'Отправляем…';
    const items = [{ q: 'С чем помочь', a: service().t }, ...steps().filter(s => s.kind !== 'contact' && ans[s.id] && String(ans[s.id]).length)
      .map(s => ({ q: s.q, a: Array.isArray(ans[s.id]) ? ans[s.id].join(', ') : ans[s.id] }))];
    try {
      const r = await fetch(`${cfg.supabaseUrl}/functions/v1/brief-intake`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey || '' },
        body: JSON.stringify({ type: svc, src, name, contact, website: document.getElementById('website').value, items }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error('send');
      root.innerHTML = top(100, false) + `<main class="q fade done" data-c="${service().c}"><span class="ok">${icon('success', 56)}</span>
        <h1>Спасибо, бриф у нас!</h1><p class="lead">Посмотрим ответы и напишем вам: ${E(contact)}.</p>
        <a class="next" href="https://adervis.ru/cases/">Пока смотрите наши работы ${icon('next', 18)}</a></main>`;
      say('done');
    } catch {
      btn.disabled = false; btn.innerHTML = `Отправить бриф ${icon('send', 18)}`;
      document.getElementById('err').textContent = 'Не получилось отправить. Попробуйте ещё раз или напишите нам в Telegram: @adervis_manager';
    }
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, st = steps()[step];
    if (act === 'hear') { heard = true; voiceOn = true; store('brief.voice', 'on'); start(); say('intro'); return; }
    if (act === 'voice') { voiceOn = !voiceOn; heard = true; store('brief.voice', voiceOn ? 'on' : 'off'); b.outerHTML = voiceBtn(); if (!voiceOn && player) player.pause(); else say(svc ? key(st) : 'intro'); return; }
    heard = true;
    if (act === 'svc') { svc = b.dataset.id; step = 0; Object.keys(ans).forEach(k => delete ans[k]); show(); return; }
    if (act === 'back') { if (step > 0) { step--; show(); } else { svc = ''; start(); } return; }
    if (act === 'opt') {
      if (st.kind === 'one') { ans[st.id] = b.dataset.v; root.querySelectorAll('.opt').forEach(x => x.classList.toggle('on', x === b)); setTimeout(next, 260); return; }
      const cur = new Set(ans[st.id] || []); cur.has(b.dataset.v) ? cur.delete(b.dataset.v) : cur.add(b.dataset.v);
      ans[st.id] = [...cur]; b.classList.toggle('on'); b.setAttribute('aria-pressed', cur.has(b.dataset.v));
      root.querySelector('.next').disabled = !cur.size; return;
    }
    if (act === 'next') {
      const ta = document.getElementById('ta');
      if (ta) { const v = ta.value.trim(); if (st.req && v.length < 3) { document.getElementById('err').textContent = 'Напишите хотя бы пару слов'; return; } ans[st.id] = v; }
      next(); return;
    }
    if (act === 'skip') { ans[st.id] = ''; next(); return; }
    if (act === 'send') send();
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'BUTTON') { const n = root.querySelector('[data-act=next]:not([disabled]), [data-act=send]'); if (n) { e.preventDefault(); n.click(); } }
  });
  if (svc) show(); else start();
})();
