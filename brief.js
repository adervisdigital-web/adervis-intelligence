// Бриф ADERVIS для клиента: hub.adervis.ru/brief.html?t=ai&src=tg
// Без ?t — выбор задачи. Вопросы только те, от которых зависят цена и срок.
// Ответы уходят в функцию brief-intake → заявка и бриф в Hub, уведомление менеджеру.
(() => {
  const cfg = window.INTEL_CONFIG || {};
  const WHERE = ['Instagram, Reels', 'TikTok', 'ВКонтакте', 'YouTube', 'Маркетплейс', 'Сайт', 'Экран на выставке или в офисе', 'Другое'];
  const COMMON = [
    { id: 'deadline', q: 'Какие сроки?', kind: 'one', options: ['Срочно, за неделю', '2–4 недели', 'Через месяц и позже', 'Не горит'] },
    { id: 'budget', q: 'Какой бюджет?', kind: 'one', options: ['до 30 000 ₽', '30–70 000 ₽', '70–150 000 ₽', '150 000 ₽ и больше', 'Посоветуйте'] },
    { id: 'refs', q: 'Ссылки на примеры, которые нравятся', kind: 'line', hint: 'Ролики, сайты, аккаунты. Можно пропустить' }
  ];
  const FORMS = {
    ai: { title: 'Рекламный ролик с нейросетями', lead: 'Реклама продукта или услуги: героиня, продукт в кадре, музыка и звуки.', fields: [
      { id: 'what', q: 'Что рекламируем?', kind: 'text', req: true, hint: 'Продукт, услуга или бренд и для кого' },
      { id: 'idea', q: 'Как вы видите ролик?', kind: 'text', hint: 'Опишите идею или пропустите: предложим сами' },
      { id: 'where', q: 'Где будет ролик?', kind: 'many', options: WHERE },
      { id: 'len', q: 'Какой длины?', kind: 'one', options: ['до 15 секунд', '30 секунд', '60 секунд', 'Пока не знаю'] },
      { id: 'people', q: 'Кто в кадре?', kind: 'one', options: ['Реалистичные люди', 'Только продукт', 'Персонажи, мультяшный стиль', 'Не знаю'] },
      { id: 'voice', q: 'Голос нужен?', kind: 'one', options: ['Да, диктор', 'Только музыка и надписи', 'Не знаю'] },
      { id: 'have', q: 'Что у вас уже есть?', kind: 'many', options: ['Фото продукта', 'Сам продукт', 'Логотип', 'Фирменный стиль'] },
      { id: 'count', q: 'Сколько роликов?', kind: 'one', options: ['Один', '2–3 версии', 'Серия на месяц'] }] },
    '3d': { title: '3D-ролик о продукте', lead: 'Покажем продукт, устройство и принцип работы так, как не снять камерой.', fields: [
      { id: 'what', q: 'Что показываем?', kind: 'text', req: true, hint: 'Продукт, оборудование или технология' },
      { id: 'show', q: 'Что важно показать?', kind: 'many', options: ['Внешний вид', 'Устройство внутри', 'Как работает', 'Производство', 'Преимущества цифрами'] },
      { id: 'models', q: 'Есть 3D-модели или чертежи?', kind: 'one', options: ['Есть 3D-модели', 'Есть чертежи', 'Только фото', 'Нет ничего'] },
      { id: 'where', q: 'Где покажете?', kind: 'many', options: ['Выставка, экран', 'Сайт', 'Соцсети', 'Презентация, продажи', 'Другое'] },
      { id: 'len', q: 'Какой длины?', kind: 'one', options: ['до 30 секунд', '30–60 секунд', '1–2 минуты', 'Не знаю'] },
      { id: 'voice', q: 'Голос и текст', kind: 'one', options: ['Диктор', 'Только надписи', 'Диктор и надписи', 'Не знаю'] }] },
    motion: { title: 'Моушн и графика', lead: 'Оформление видео и шоу, анимация логотипа, объясняющие ролики, инфографика.', fields: [
      { id: 'kind', q: 'Что нужно?', kind: 'many', options: ['Оформление видео или шоу', 'Анимация логотипа', 'Объясняющий ролик', 'Инфографика', 'Заставка и титры', 'Другое'] },
      { id: 'what', q: 'Опишите задачу', kind: 'text', req: true, hint: 'Что показываем, для кого, сколько элементов' },
      { id: 'volume', q: 'Объём', kind: 'line', hint: 'Например: заставка, 20 плашек, 5 титров' },
      { id: 'brand', q: 'Фирменный стиль', kind: 'one', options: ['Есть брендбук', 'Есть логотип и цвета', 'Нужно придумать'] },
      { id: 'where', q: 'Где покажете?', kind: 'many', options: WHERE }] },
    site: { title: 'Сайт или приложение', lead: 'Лендинг, сайт компании, магазин, запись и бронирование, личный кабинет.', fields: [
      { id: 'kind', q: 'Что нужно?', kind: 'one', options: ['Лендинг', 'Сайт компании', 'Магазин или каталог', 'Приложение, кабинет, бронирование', 'Редизайн', 'Не знаю'] },
      { id: 'what', q: 'О бизнесе и задаче', kind: 'text', req: true, hint: 'Чем занимаетесь и что сайт должен делать' },
      { id: 'does', q: 'Что сайт должен уметь?', kind: 'many', options: ['Собирать заявки', 'Принимать оплату', 'Запись или бронирование', 'Личный кабинет', 'Каталог товаров', 'Связь с CRM'] },
      { id: 'content', q: 'Тексты и фото', kind: 'one', options: ['Всё есть', 'Есть частично', 'Нужно сделать'] }] },
    shoot: { title: 'Съёмка и мероприятия', lead: 'Съёмка мероприятий, рекламных роликов, интервью и фото.', fields: [
      { id: 'kind', q: 'Что снимаем?', kind: 'one', options: ['Мероприятие', 'Рекламный ролик', 'Интервью, экспертное видео', 'Фото', 'Другое'] },
      { id: 'when', q: 'Дата и город', kind: 'line', req: true, hint: 'Например: 20 ноября, Пермь' },
      { id: 'dur', q: 'Сколько длится съёмка?', kind: 'one', options: ['до 2 часов', 'Полдня', 'Весь день', 'Несколько дней'] },
      { id: 'out', q: 'Что нужно на выходе?', kind: 'many', options: ['Ролик-отчёт', 'Короткие клипы для соцсетей', 'Фото', 'Трансляция', 'Полная запись'] },
      { id: 'what', q: 'Расскажите о задаче', kind: 'text', hint: 'Что за событие, сколько гостей, что важно снять' }] },
    content: { title: 'Контент на месяц', lead: 'Ролики и фото для соцсетей каждый месяц.', fields: [
      { id: 'where', q: 'Где публикуете?', kind: 'many', options: ['ВКонтакте', 'Telegram', 'Instagram', 'YouTube', 'TikTok'] },
      { id: 'per', q: 'Сколько роликов в месяц?', kind: 'one', options: ['4', '8', '12', '16 и больше', 'Посоветуйте'] },
      { id: 'what', q: 'Чем занимаетесь и что хотите от соцсетей?', kind: 'text', req: true, hint: 'Продукт, аудитория, чего не хватает: охватов, заявок, узнаваемости' },
      { id: 'how', q: 'Как снимаем?', kind: 'one', options: ['Приезжаете и снимаете', 'Есть свои материалы', 'Нейросети', 'Обсудим'] }] },
    other: { title: 'Другая задача', lead: 'Расскажите, что нужно, и предложим, как сделать.', fields: [
      { id: 'what', q: 'Опишите задачу', kind: 'text', req: true, hint: 'Что нужно, для кого и зачем' }] }
  };
  const ORDER = ['ai', '3d', 'motion', 'site', 'shoot', 'content', 'other'];
  const P = new URLSearchParams(location.search), type = P.get('t'), src = (P.get('src') || '').slice(0, 10);
  const root = document.getElementById('brief');
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const head = (title, lead) => `<header class="bh"><div class="wrap"><a class="logo" href="https://adervis.ru"><img src="brand/logo-2026.svg" alt="ADERVIS"></a>
    <p class="kick">Бриф · 2–3 минуты</p><h1>${E(title)}</h1><p class="lead">${E(lead)}</p></div></header>`;

  if (!FORMS[type]) {
    document.title = 'Бриф ADERVIS';
    root.innerHTML = head('Расскажите о задаче', 'Выберите, что нужно сделать. Ответы помогут сразу назвать сроки и примерную стоимость.') +
      `<main class="wrap"><ul class="types">${ORDER.map(t => `<li><a href="?t=${t}${src ? `&src=${encodeURIComponent(src)}` : ''}"><b>${E(FORMS[t].title)}</b><span>${E(FORMS[t].lead)}</span></a></li>`).join('')}</ul></main>`;
    return;
  }
  const form = FORMS[type], fields = [...form.fields, ...COMMON];
  document.title = `Бриф ADERVIS: ${form.title}`;
  const field = (f, i) => {
    const req = f.req ? ' <i>обязательно</i>' : '';
    if (f.kind === 'text' || f.kind === 'line') {
      const tag = f.kind === 'text' ? `<textarea id="f${i}" rows="3" maxlength="3000" placeholder="${E(f.hint || '')}"></textarea>` : `<input id="f${i}" maxlength="500" placeholder="${E(f.hint || '')}">`;
      return `<div class="q"><label for="f${i}">${E(f.q)}${req}</label>${tag}</div>`;
    }
    const role = f.kind === 'many' ? 'checkbox' : 'radio';
    return `<fieldset class="q"><legend>${E(f.q)}${f.kind === 'many' ? ' <i>можно несколько</i>' : ''}</legend><div class="chips">${f.options.map((o, j) =>
      `<label class="chip"><input type="${role}" name="f${i}" value="${E(o)}"><span>${E(o)}</span></label>`).join('')}</div></fieldset>`;
  };
  root.innerHTML = head(form.title, form.lead) + `<main class="wrap"><form id="bf" novalidate>
    ${fields.map(field).join('')}
    <div class="q two"><div><label for="nm">Как к вам обращаться? <i>обязательно</i></label><input id="nm" maxlength="120" autocomplete="name"></div>
      <div><label for="ct">Как с вами связаться? <i>обязательно</i></label><input id="ct" maxlength="200" placeholder="@username, телефон или почта" autocomplete="tel"></div></div>
    <input class="hp" id="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <p class="err" id="err" role="alert"></p>
    <button class="send" type="submit">Отправить бриф</button>
    <p class="fine">Ответы получит команда ADERVIS и напишет вам по указанному контакту.</p>
  </form></main>`;
  const $ = id => document.getElementById(id);
  $('bf').addEventListener('submit', async ev => {
    ev.preventDefault();
    const items = fields.map((f, i) => {
      const a = f.kind === 'text' || f.kind === 'line' ? $('f' + i).value.trim()
        : [...document.querySelectorAll(`input[name="f${i}"]:checked`)].map(x => x.value).join(', ');
      return { q: f.q, a, req: f.req };
    });
    const miss = items.find(x => x.req && !x.a);
    const name = $('nm').value.trim(), contact = $('ct').value.trim();
    const err = miss ? `Ответьте, пожалуйста: «${miss.q}»` : !name ? 'Напишите, как к вам обращаться' : contact.length < 3 ? 'Оставьте контакт, чтобы мы могли ответить' : '';
    $('err').textContent = err;
    if (err) return;
    const btn = ev.target.querySelector('.send'); btn.disabled = true; btn.textContent = 'Отправляем…';
    try {
      const r = await fetch(`${cfg.supabaseUrl}/functions/v1/brief-intake`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey || '' },
        body: JSON.stringify({ type, src, name, contact, website: $('website').value, items: items.filter(x => x.a).map(({ q, a }) => ({ q, a })) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error('send');
      root.querySelector('main').innerHTML = `<div class="done"><h2>Спасибо, бриф у нас!</h2><p>Посмотрим ответы и напишем вам по контакту: ${E(contact)}.</p></div>`;
      window.scrollTo(0, 0);
    } catch {
      btn.disabled = false; btn.textContent = 'Отправить бриф';
      $('err').textContent = 'Не получилось отправить. Попробуйте ещё раз или напишите нам в Telegram: @adervis_manager';
    }
  });
})();
