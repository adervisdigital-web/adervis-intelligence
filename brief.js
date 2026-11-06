// Бриф ADERVIS для клиента: hub.adervis.ru/brief.html[?t=video&src=tg]
// Первый экран — услуги плитками с кадрами из наших работ. Дальше один вопрос
// на экран; на компьютере справа собирается «Ваш бриф». Перед отправкой —
// проверка ответов с правкой любого. Голосовой помощник читает вопросы.
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
  const CLIENTS = [['sibur', 'Сибур'], ['himprom', 'Химпром'], ['promobot', 'Промобот'], ['ujin', 'UJIN'], ['bitva-robotov', 'Битва роботов'], ['shabani', 'Shabani Energy'],
    ['rokstar', 'Рок-Стар'], ['psp', 'PSP Sport Nutrition'], ['express-import', 'Экспресс-Импорт'], ['aratta', 'Аратта'], ['stikbot', 'Stickbot'], ['feliks', 'Феликс']];
  // цвета услуг и прогресс ставим из скрипта: строгая политика страницы не пускает style="" в разметке
  const paint = () => { root.querySelectorAll('[data-c]').forEach(el => el.style.setProperty('--c', el.dataset.c)); root.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; }); };
  new MutationObserver(paint).observe(root, { childList: true, subtree: true });
  const ans = {}, store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* без памяти */ } };
  let voiceOn = (() => { try { return localStorage.getItem('brief.voice') !== 'off'; } catch (e) { return true; } })();
  let heard = false, step = 0, player = null, dir = 'fwd', review = false, editing = false;

  const qs = () => svc ? [...D.steps[svc], ...D.common] : [];
  const total = () => qs().length + 1;                       // + шаг «проверьте и отправьте»
  const service = () => D.services.find(s => s.id === svc);
  const key = st => D.common.includes(st) ? 'common-' + st.id : `${svc}-${st.id}`;
  const shown = v => Array.isArray(v) ? v.join(', ') : v;
  const plural = n => n % 10 === 1 && n % 100 !== 11 ? 'вопрос' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'вопроса' : 'вопросов';

  // ---- голос: короткие фразы помощника, файлы brief-voice/<ключ>.mp3; пока говорит — кнопка «дышит»
  function say(k) {
    if (player) { player.pause(); player = null; speaking(false); }
    if (!voiceOn || !heard) return;
    player = new Audio(`brief-voice/${k}.mp3`);
    player.onplay = () => speaking(true); player.onended = player.onpause = () => speaking(false);
    player.play().catch(() => speaking(false));
  }
  const speaking = on => root.querySelector('.vbtn')?.classList.toggle('talk', on);
  const voiceBtn = () => `<button class="vbtn${voiceOn ? ' on' : ''}" data-act="voice" aria-pressed="${voiceOn}" title="${voiceOn ? 'Выключить голос' : 'Включить голос'}">
    <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="vt">${voiceOn ? 'Голос включён' : 'Голос выключен'}</span></button>`;
  const top = (pct, back) => `<header class="qtop" data-c="${service()?.c || '#F6BD3A'}">
    ${back ? `<button class="back" data-act="back" aria-label="Назад">${icon('back', 22)}</button>` : '<span class="qlabel">Бриф</span>'}
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i data-w="${pct}"></i></div>${voiceBtn()}</header>`;

  // ---- справа на компьютере: бриф собирается по ходу ответов
  function side() {
    const s = service();
    const rows = qs().filter(q => ans[q.id] && shown(ans[q.id]));
    return `<aside class="side" data-c="${s.c}" aria-label="Ваш бриф"><p class="sk">Ваш бриф</p>
      <div class="sv"><img src="brief-img/${s.id}.webp" alt=""><span>${icon(s.icon, 18)} ${E(s.t)}</span></div>
      <ol>${rows.map(q => `<li><small>${E(q.q)}</small><b>${E(shown(ans[q.id]))}</b></li>`).join('')}
        ${rows.length < qs().length ? `<li class="todo"><small>Ещё ${qs().length - rows.length}</small><b>${plural(qs().length - rows.length)} впереди</b></li>` : ''}</ol></aside>`;
  }
  const frame = (pct, back, main) => top(pct, back) + `<div class="stage${svc ? ' two' : ''}"><main class="q ${dir}" data-c="${service()?.c || '#F6BD3A'}">${main}</main>${svc ? side() : ''}</div>`;

  // ---- экран 0: с чем помочь
  function start() {
    root.innerHTML = top(4, false) + `<div class="stage"><main class="q ${dir}">
      <p class="kick">Бриф · 2 минуты</p>
      <h1>С чем вам помочь?</h1>
      <p class="lead">Выберите направление. Ответы помогут сразу назвать сроки и примерную стоимость.</p>
      ${!heard ? `<button class="hear" data-act="hear"><span class="pulse">${icon('play', 16)}</span> Заполнять с голосовым помощником</button>` : ''}
      <div class="svc">${D.services.map((s, i) => `<button class="tile" data-act="svc" data-id="${s.id}" data-c="${s.c}" data-i="${i}">
        <img src="brief-img/${s.id}.webp" alt="" loading="${i < 4 ? 'eager' : 'lazy'}"><span class="ti">${icon(s.icon, 28)}</span>
        <span class="tt"><b>${E(s.t)}</b><small>${E(s.sub)}</small></span><span class="go">${icon('next', 18)}</span></button>`).join('')}</div>
      <ol class="how" aria-label="Как это работает">
        <li><span>1</span><b>Выберите направление</b><small>Видео, фото, дизайн, ИИ или сайт</small></li>
        <li><span>2</span><b>Ответьте на вопросы</b><small>Кнопками, пара слов там, где нужно</small></li>
        <li><span>3</span><b>Получите план и стоимость</b><small>Напишем вам с готовым предложением</small></li></ol>
      <section class="clients" aria-label="Нам доверяют"><p>Нам доверяют</p><div>${CLIENTS.map(([f, n]) => `<img src="brief-img/clients/${f}.webp" alt="${E(n)}" width="240" height="120">`).join('')}</div></section></main></div>`;
  }

  // ---- вопрос
  function show() {
    review = false;
    const list = qs(), st = list[step], pct = Math.round(8 + 92 * step / total()), v = ans[st.id];
    let body = '';
    if (st.kind === 'one' || st.kind === 'many') {
      const sel = st.kind === 'many' ? (v || []) : [v];
      body = `<div class="opts${st.options.length > 4 ? ' six' : ''}">${st.options.map(([t, ic], i) =>
        `<button class="opt${sel.includes(t) ? ' on' : ''}" data-act="opt" data-v="${E(t)}" data-i="${i}" aria-pressed="${sel.includes(t)}"><span class="oi">${icon(ic, 24)}</span><b>${E(t)}</b>${st.kind === 'many' ? `<i class="tick">${icon('check', 14)}</i>` : ''}</button>`).join('')}</div>`
        + (st.kind === 'many' ? `<button class="next" data-act="next" ${(v || []).length ? '' : 'disabled'}>Дальше ${icon('next', 18)}</button>` : '');
    } else {
      body = `<textarea id="ta" rows="4" maxlength="3000" placeholder="${E(st.hint || '')}">${E(v || '')}</textarea>
        <p class="err" id="err" role="alert"></p>
        <div class="row"><button class="next" data-act="next">Дальше ${icon('next', 18)}</button>${st.req ? '' : '<button class="skip" data-act="skip">Пропустить</button>'}</div>`;
    }
    root.innerHTML = frame(pct, true, `<p class="kick"><span class="chip">${icon(service().icon, 15)} ${E(service().t)}</span> Вопрос ${step + 1} из ${total()}</p>
      <h1>${E(st.q)}</h1>${st.kind === 'many' ? '<p class="lead small">Можно выбрать несколько</p>' : ''}${body}`);
    const f = root.querySelector('textarea'); if (f && matchMedia('(min-width: 721px)').matches) f.focus();
    say(key(st));
  }

  // ---- проверьте и отправьте: все ответы с правкой и контакт
  function final() {
    review = true; editing = false;
    const rows = [{ q: 'С чем помочь', a: service().t, i: -1 }, ...qs().map((q, i) => ({ q: q.q, a: shown(ans[q.id]) || '', i }))];
    root.innerHTML = frame(96, true, `<p class="kick"><span class="chip">${icon(service().icon, 15)} ${E(service().t)}</span> Последний шаг</p>
      <h1>Проверьте и отправьте</h1>
      <ul class="rev">${rows.map(r => `<li><span><small>${E(r.q)}</small>${r.a ? `<b>${E(r.a)}</b>` : '<b class="none">Пропущено</b>'}</span><button class="edit" data-act="edit" data-i="${r.i}" aria-label="Изменить: ${E(r.q)}">${icon('edit', 16)}</button></li>`).join('')}</ul>
      <div class="fields"><label>Как к вам обращаться?<input id="nm" maxlength="120" autocomplete="name" value="${E(ans.name || '')}"></label>
        <label>Куда написать?<input id="ct" maxlength="200" placeholder="@username, телефон или почта" autocomplete="tel" value="${E(ans.contact || '')}"></label>
        <input class="hp" id="website" tabindex="-1" autocomplete="off" aria-hidden="true"></div>
      <p class="err" id="err" role="alert"></p>
      <button class="next send" data-act="send">Отправить бриф ${icon('send', 18)}</button>
      <p class="fine">Нажимая «Отправить бриф», вы соглашаетесь с <a href="https://adervis.ru/docs/#docs-privacy" target="_blank" rel="noopener noreferrer">политикой конфиденциальности</a>. Ответы получит только команда ADERVIS.</p>`);
    say('contact');
  }

  function go(n, d = 'fwd') { dir = d; step = n; if (step >= qs().length) final(); else show(); window.scrollTo(0, 0); }
  async function send() {
    const name = document.getElementById('nm').value.trim(), contact = document.getElementById('ct').value.trim();
    ans.name = name; ans.contact = contact;
    const err = !name ? 'Напишите, как к вам обращаться' : contact.length < 3 ? 'Оставьте контакт, чтобы мы могли ответить' : '';
    document.getElementById('err').textContent = err;
    if (err) return;
    const btn = root.querySelector('.send'); btn.disabled = true; btn.innerHTML = 'Отправляем…';
    const items = [{ q: 'С чем помочь', a: service().t }, ...qs().filter(s => ans[s.id] && String(shown(ans[s.id])).length).map(s => ({ q: s.q, a: shown(ans[s.id]) }))];
    try {
      const r = await fetch(`${cfg.supabaseUrl}/functions/v1/brief-intake`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey || '' },
        body: JSON.stringify({ type: svc, src, name, contact, website: document.getElementById('website').value, items }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error('send');
      dir = 'fwd';
      root.innerHTML = top(100, false) + `<div class="stage"><main class="q fwd done" data-c="${service().c}"><span class="ok">${icon('success', 52)}</span>
        <h1>Спасибо, бриф у нас!</h1><p class="lead">Посмотрим ответы и напишем вам: ${E(contact)}.</p>
        <a class="next" href="https://adervis.ru/cases/">Пока смотрите наши работы ${icon('next', 18)}</a></main></div>`;
      say('done');
    } catch {
      btn.disabled = false; btn.innerHTML = `Отправить бриф ${icon('send', 18)}`;
      document.getElementById('err').textContent = 'Не получилось отправить. Попробуйте ещё раз или напишите нам в Telegram: @adervis_manager';
    }
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, st = qs()[step];
    if (act === 'hear') { heard = true; voiceOn = true; store('brief.voice', 'on'); b.remove(); say('intro'); return; }
    if (act === 'voice') { voiceOn = !voiceOn; heard = true; store('brief.voice', voiceOn ? 'on' : 'off'); b.outerHTML = voiceBtn(); if (voiceOn) say(review ? 'contact' : svc ? key(st) : 'intro'); else if (player) player.pause(); return; }
    heard = true;
    if (act === 'svc') { editing = false; svc = b.dataset.id; Object.keys(ans).forEach(k => delete ans[k]); go(0); return; }
    if (act === 'back') { if (review) go(qs().length - 1, 'back'); else if (step > 0) go(step - 1, 'back'); else { svc = ''; dir = 'back'; start(); } return; }
    if (act === 'edit') { const i = Number(b.dataset.i); if (i < 0) { svc = ''; dir = 'back'; start(); } else { editing = true; go(i, 'back'); } return; }
    if (act === 'opt') {
      if (st.kind === 'one') { ans[st.id] = b.dataset.v; root.querySelectorAll('.opt').forEach(x => x.classList.toggle('on', x === b)); setTimeout(() => go(editing ? qs().length : step + 1), 280); return; }
      const cur = new Set(ans[st.id] || []); cur.has(b.dataset.v) ? cur.delete(b.dataset.v) : cur.add(b.dataset.v);
      ans[st.id] = [...cur]; b.classList.toggle('on'); b.setAttribute('aria-pressed', cur.has(b.dataset.v));
      root.querySelector('.next').disabled = !cur.size; return;
    }
    if (act === 'next') {
      const ta = document.getElementById('ta');
      if (ta) { const v = ta.value.trim(); if (st.req && v.length < 3) { document.getElementById('err').textContent = 'Напишите хотя бы пару слов'; return; } ans[st.id] = v; }
      go(editing ? qs().length : step + 1); return;
    }
    if (act === 'skip') { ans[st.id] = ''; go(editing ? qs().length : step + 1); return; }
    if (act === 'send') send();
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'BUTTON') { const n = root.querySelector('[data-act=next]:not([disabled]), [data-act=send]'); if (n) { e.preventDefault(); n.click(); } }
  });
  if (svc) show(); else start();
})();
