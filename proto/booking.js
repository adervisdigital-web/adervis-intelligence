// Прототип брони залов для КП: гость и администратор на общих данных (всё в памяти страницы, ничего не сохраняется).
// Данные заведения: ?d=<папка брифа> → kp-media/<папка>/demo.json в хранилище (в коде сайта данных клиента нет).
(() => {
  const BASE = 'https://mlsmybtspqqpsvbukbcj.supabase.co/storage/v1/object/public/kp-media/';
  const $ = id => document.getElementById(id);
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rub = n => Math.round(n).toLocaleString('ru') + ' ₽';
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], WDF = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const NAMES = ['Артём', 'Мария · караоке', 'Денис · PS5', 'Корпоратив', 'Анна · ДР', 'Кирилл', 'Вечеринка', 'Игорь', 'Елена', 'Show Today', 'Кино-свидание', 'Влад · PS5', 'Ольга', 'Выпускной'];
  const dayAt = k => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + k); return d; };
  const dayName = k => { const d = dayAt(k); return `${WDF[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`; };
  const dayShort = k => { const d = dayAt(k); return `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`; };
  const hrsWord = n => n % 10 === 1 && n % 100 !== 11 ? 'час' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'часа' : 'часов';

  let C;
  const st = { day: 0, aday: 0, sel: null, reqs: [], phone: [], seq: 0, pop: null };
  const hh = i => String((C.from + i) % 24).padStart(2, '0');
  const span = (a, n) => `${hh(a)}:00–${hh(a + n)}:00`;

  // занятость дня: детерминированная по дню, вечером плотнее
  const cache = {};
  function base(day) {
    if (cache[day]) return cache[day];
    let x = 1000 + day * 97 + 13; const r = () => (x = x * 16807 % 2147483647) / 2147483647;
    const out = [];
    C.halls.forEach((_, h) => {
      let i = Math.floor(r() * 3);
      while (i < C.hours) {
        const eve = C.from + i >= 18;
        if (r() < (eve ? 0.45 : 0.18)) { const n = 2 + Math.floor(r() * 3); if (i + n <= C.hours) { out.push({ h, a: i, n, label: NAMES[Math.floor(r() * NAMES.length)], kind: r() < 0.2 ? 'tel' : 'ok' }); } i += n + 1; }
        else i += 1;
      }
    });
    return (cache[day] = out);
  }
  const blocks = day => [...base(day), ...st.phone.filter(p => p.day === day),
    ...st.reqs.filter(q => q.day === day && q.status !== 'alt').map(q => ({ h: q.h, a: q.a, n: q.n, label: q.name, kind: q.status === 'ok' ? 'ok' : 'rq', q }))];
  const cellState = (day, h, i) => {
    for (const b of blocks(day)) if (b.h === h && i >= b.a && i < b.a + b.n) return b.kind === 'rq' ? 'p' : 'b';
    return '';
  };

  // ---------- гость ----------
  function drawGuest() {
    $('gDays').innerHTML = Array.from({ length: 7 }, (_, k) => { const d = dayAt(k);
      return `<button type="button" class="day${k === st.day ? ' on' : ''}" data-day="${k}"><b>${d.getDate()}</b><i>${k === 0 ? 'сегодня' : WD[d.getDay()]}</i></button>`; }).join('');
    $('gMine').innerHTML = st.reqs.slice().reverse().map(q => `<div class="m ${q.status}"><b>${E(C.halls[q.h].n)}, ${E(dayShort(q.day))}, ${span(q.a, q.n)}</b><span>${q.status === 'ok' ? 'подтверждено' : q.status === 'alt' ? 'предложат другое время' : 'ждёт ответа'}</span></div>`).join('');
    $('gHalls').innerHTML = C.halls.map((x, h) => `<div class="hall"><div class="ph" data-ph="${h}"><h3>${E(x.n)}</h3><span class="price">${rub(x.p)}/час</span></div>
      <div class="slots">${Array.from({ length: C.hours }, (_, i) => { const s = cellState(st.day, h, i);
        const sel = st.sel && st.sel.h === h && i >= st.sel.a && i <= st.sel.b ? ' s' : '';
        return `<button type="button" class="sl ${s}${s ? '' : sel}" data-h="${h}" data-i="${i}"${s ? ' disabled' : ''}>${hh(i)}</button>`; }).join('')}</div></div>`).join('');
    document.querySelectorAll('.ph').forEach(el => { const x = C.halls[+el.dataset.ph];
      el.style.backgroundImage = x.photo ? `url("${encodeURI(x.photo)}")` : `radial-gradient(80% 120% at 20% 0%, ${x.c[0]} 0%, transparent 55%), radial-gradient(70% 90% at 100% 100%, ${x.c[1]} 0%, transparent 60%)`;
      if (!x.photo) el.style.backgroundColor = '#14141c'; });
    drawBar();
  }
  function drawBar() {
    const s = st.sel;
    if (!s) { $('gBar').classList.remove('show'); return; }
    const n = s.b - s.a + 1, x = C.halls[s.h];
    $('gBarT').textContent = `${x.n} · ${dayName(st.day)}`;
    $('gBarS').textContent = `${span(s.a, n)} · ${n} ${hrsWord(n)} · ${rub(x.p * n)}`;
    $('gBar').classList.add('show');
  }
  function tapSlot(h, i) {
    const s = st.sel;
    if (!s || s.h !== h) st.sel = { h, a: i, b: i };
    else if (s.a === i && s.b === i) st.sel = null;
    else if (i >= s.a && i <= s.b) st.sel = i === s.a ? { h, a: i + 1, b: s.b } : { h, a: s.a, b: i - 1 };
    else { const a = Math.min(s.a, i), b = Math.max(s.b, i);
      let free = true; for (let k = a; k <= b; k++) if (cellState(st.day, h, k)) free = false;
      st.sel = free ? { h, a, b } : { h, a: i, b: i }; }
    if (st.sel && st.sel.a > st.sel.b) st.sel = null;
    drawGuest();
  }
  function openForm() {
    const s = st.sel; if (!s) return; const n = s.b - s.a + 1, x = C.halls[s.h];
    $('gSum').innerHTML = `<b>${E(x.n)}</b>, ${E(dayName(st.day))}, <b>${span(s.a, n)}</b><br>${n} ${hrsWord(n)} · ${rub(x.p * n)}`;
    $('scr').classList.add('form'); setTimeout(() => $('fName').focus({ preventScroll: true }), 350);
  }
  const closeForm = () => $('scr').classList.remove('form');
  function send(ev) {
    ev.preventDefault();
    const s = st.sel; if (!s) return;
    const q = { id: ++st.seq, day: st.day, h: s.h, a: s.a, n: s.b - s.a + 1, name: $('fName').value.trim() || 'Гость', tel: $('fTel').value.trim() || '+7 9** *** ** **',
      gu: $('fGu').value.trim() || '2', com: $('fCom').value.trim(), status: 'wait', at: Date.now() };
    st.reqs.push(q); st.sel = null; closeForm();
    toast('Заявка отправлена', 'Администратор подтвердит и напишет вам', '');
    st.aday = q.day; drawGuest(); drawAdmin(q.id);
    $('aTgS').textContent = `Новая заявка: ${C.halls[q.h].n}, ${dayShort(q.day)}, ${span(q.a, q.n)}, гостей: ${q.gu}`;
    setTimeout(() => $('aTg').classList.add('show'), 500); setTimeout(() => $('aTg').classList.remove('show'), 5000);
  }
  let tt;
  function toast(t, s, kind) {
    $('gT').textContent = t; $('gS').textContent = s; $('gIc').textContent = kind === 'alt' ? '↺' : '✓';
    const el = $('gToast'); el.className = 'toast show ' + kind; clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 3800);
  }

  // ---------- администратор ----------
  function drawAdmin(fresh) {
    $('aDay').textContent = dayShort(st.aday);
    const bl = blocks(st.aday);
    const wait = st.reqs.filter(q => q.status === 'wait').length;
    $('kReq').textContent = wait; $('sReq').textContent = wait; $('tabBadge').textContent = wait || '';
    $('kB').textContent = bl.filter(b => b.kind !== 'rq').length;
    const eve = Math.max(0, 18 - C.from), cells = C.halls.length * (C.hours - eve);
    let busy = 0; bl.filter(b => b.kind !== 'rq').forEach(b => { for (let k = b.a; k < b.a + b.n; k++) if (k >= eve) busy++; });
    $('kL').textContent = Math.round(busy / Math.max(cells, 1) * 100) + '%';
    const cols = `repeat(${C.hours}, 1fr)`;
    $('aGrid').innerHTML = `<div class="hrs"><span></span><div class="hh" style="grid-template-columns:${cols}">${Array.from({ length: C.hours }, (_, i) => `<span>${hh(i)}</span>`).join('')}</div></div>` +
      C.halls.map((x, h) => `<div class="gr"><div class="n">${E(x.n)}<i>${rub(x.p)}/ч</i></div><div class="cells" style="grid-template-columns:${cols}">
        ${Array.from({ length: C.hours }, (_, i) => `<div class="cell" data-h="${h}" data-i="${i}"></div>`).join('')}
        ${bl.filter(b => b.h === h).map(b => `<div class="bk ${b.kind}" style="left:${b.a / C.hours * 100}%;width:${b.n / C.hours * 100}%">${E(b.kind === 'rq' ? b.label + ' · заявка' : b.label)}<small>${b.q ? `гостей: ${E(b.q.gu)}` : b.kind === 'tel' ? 'по телефону' : b.n + ' ' + hrsWord(b.n)}</small></div>`).join('')}
      </div></div>`).join('');
    $('aReqs').innerHTML = st.reqs.length ? st.reqs.slice().reverse().map(q => `<div class="req ${q.status}${q.id === fresh ? ' in' : ''}">
        <div class="t">${q.id === fresh ? 'только что' : 'недавно'} · с сайта</div><b>${E(q.name)} · ${E(C.halls[q.h].n)}</b>
        <p>${E(dayShort(q.day))}, ${span(q.a, q.n)} · гостей: ${E(q.gu)}<br>${E(q.tel)}${q.com ? `<br>«${E(q.com)}»` : ''}</p>
        ${q.status === 'wait' ? `<div class="a"><button type="button" class="yes" data-ok="${q.id}">Подтвердить</button><button type="button" class="no" data-alt="${q.id}">Другое время</button></div>`
          : `<div class="st">${q.status === 'ok' ? 'Подтверждено, гость получил ответ' : 'Предложили другое время'}</div>`}</div>`).join('')
      : '<p class="empty">Пока заявок нет. Отправьте заявку со страницы гостя.</p>';
  }
  function answer(id, ok) {
    const q = st.reqs.find(r => r.id === id); if (!q) return;
    q.status = ok ? 'ok' : 'alt';
    drawAdmin(); drawGuest();
    if (ok) toast('Бронь подтверждена', `${C.halls[q.h].n}, ${dayShort(q.day)}, ${span(q.a, q.n)}. Ждём вас!`, 'ok');
    else toast('Предложат другое время', 'Администратор напишет вам с вариантами', 'alt');
  }
  function openPop(cell) {
    const h = +cell.dataset.h, i = +cell.dataset.i;
    if (cellState(st.aday, h, i)) return;
    st.pop = { h, i };
    $('aPopT').textContent = `Бронь по телефону · ${C.halls[h].n}, ${hh(i)}:00`;
    const r = cell.getBoundingClientRect(), box = $('admin').getBoundingClientRect(), pop = $('aPop');
    pop.style.left = Math.min(r.left - box.left, box.width - 236) + 'px'; pop.style.top = (r.bottom - box.top + 6) + 'px';
    pop.classList.add('show');
  }
  function addPhone(n) {
    const p = st.pop; if (!p) return;
    let k = 0; while (k < n && p.i + k < C.hours && !cellState(st.aday, p.h, p.i + k)) k++;
    if (k) st.phone.push({ day: st.aday, h: p.h, a: p.i, n: k, label: 'по телефону', kind: 'tel' });
    $('aPop').classList.remove('show'); st.pop = null; drawAdmin(); drawGuest();
  }

  // ---------- события ----------
  document.addEventListener('click', ev => {
    const t = ev.target;
    const day = t.closest('[data-day]'); if (day) { st.day = +day.dataset.day; st.sel = null; drawGuest(); return; }
    const sl = t.closest('.sl'); if (sl && !sl.disabled) { tapSlot(+sl.dataset.h, +sl.dataset.i); return; }
    if (t.closest('#gReq')) { openForm(); return; }
    if (t.closest('#gWrite')) { toast('Чат с администратором', C.write || 'Откроется переписка в ВК или Telegram', ''); return; }
    if (t.closest('#gClose') || t.closest('#gDim')) { closeForm(); return; }
    const ok = t.closest('[data-ok]'); if (ok) { answer(+ok.dataset.ok, true); return; }
    const alt = t.closest('[data-alt]'); if (alt) { answer(+alt.dataset.alt, false); return; }
    if (t.closest('#aPrev')) { st.aday = Math.max(0, st.aday - 1); drawAdmin(); return; }
    if (t.closest('#aNext')) { st.aday = Math.min(6, st.aday + 1); drawAdmin(); return; }
    const pn = t.closest('[data-n]'); if (pn) { addPhone(+pn.dataset.n); return; }
    if (t.closest('#aPopX')) { $('aPop').classList.remove('show'); st.pop = null; return; }
    const cell = t.closest('.cell'); if (cell) { openPop(cell); return; }
    const tab = t.closest('[data-tab]'); if (tab) { document.body.classList.toggle('ta', tab.dataset.tab === 'a');
      document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b === tab)); window.scrollTo(0, 0); return; }
  });
  $('gSheet').addEventListener('submit', send);

  // ---------- данные ----------
  const DEMO = { name: 'Ваше заведение', sub: 'Адрес · выберите зал и время', tags: ['караоке', 'игры'], from: 14, hours: 14,
    halls: [{ n: 'Зал 1', p: 1000, c: ['#ff2d3a', '#2f4dff'] }, { n: 'Зал 2', p: 800, c: ['#8a2bff', '#ff2d6f'] }, { n: 'Зал 3', p: 1200, c: ['#00c2ff', '#3d6bff'] }] };
  function start(cfg) {
    C = Object.assign({}, DEMO, cfg); C.halls = (C.halls || DEMO.halls).map((x, k) => Object.assign({ c: DEMO.halls[k % 3].c }, x));
    document.title = `${C.name}: прототип брони`;
    $('gName').textContent = C.name; $('aName').textContent = C.name; $('gSub').textContent = C.sub || '';
    $('gTags').innerHTML = (C.tags || []).map(t => `<span>${E(t)}</span>`).join('');
    drawGuest(); drawAdmin();
  }
  const d = (new URLSearchParams(location.search).get('d') || '').replace(/[^a-z0-9-]/g, '');
  if (!d) { start({}); return; }
  fetch(`${BASE}${d}/demo.json`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(cfg => {
    (cfg.halls || []).forEach(x => { if (x.photo && !/^https:\/\/[a-z0-9]+\.supabase\.co\//.test(x.photo)) x.photo = ''; });
    start(cfg);
  });
})();
