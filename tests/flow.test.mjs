// Разговор бота с клиентом (_shared/flow.ts) на подменённой базе и каналах:
// меню, анкета → заявка, ИИ-ответ, режим менеджера, повторы ВКонтакте,
// ручные ответы админа. Плюс разбор событий ВКонтакте и его клавиатура.
import { handleIncoming, recordManual } from '../supabase/functions/_shared/flow.ts';
import { parseVk, vkKeyboard, parseUpdate, portfolioReply, MAIN_KB } from '../supabase/functions/_shared/bot.ts';

let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  -> ' + extra : '')); };

// --- подменённая база: столько запросов supabase-js, сколько нужно разговору
function fakeDb() {
  const T = { prospects: [], messages: [], leads: [] };
  let n = 0;
  const from = table => {
    const q = { op: 'select', filters: [], ord: null, lim: null, row: null, patch: null };
    const rows = () => (T[table] ||= []).filter(r => q.filters.every(f => f(r)));
    const run = () => {
      if (q.op === 'insert') {
        const list = Array.isArray(q.row) ? q.row : [q.row];
        let made = null;
        for (const r of list) {
          const row = { id: r.id ?? `${table}-${++n}`, created_at: new Date(Date.now() + ++n).toISOString(), unread: 0, bot_mode: 'bot', ...r };
          if (table === 'prospects' && ['tg_chat_id', 'vk_peer_id'].some(k => row[k] != null && T.prospects.some(p => p[k] === row[k]))) {
            return { data: null, error: { message: 'duplicate key' } };
          }
          T[table].push(row);
          made = row;
          if (table === 'messages') {
            const p = T.prospects.find(x => x.id === row.prospect_id);
            if (p) Object.assign(p, { last_text: row.text, last_direction: row.direction, unread: p.unread + (row.direction === 'in' ? 1 : 0) });
          }
        }
        return { data: made, error: null };
      }
      if (q.op === 'update') { const rs = rows(); rs.forEach(r => Object.assign(r, structuredClone(q.patch))); return { data: rs, error: null }; }
      let rs = rows();
      if (q.ord) rs = [...rs].sort((a, b) => (q.ord[1] ? 1 : -1) * String(a[q.ord[0]]).localeCompare(String(b[q.ord[0]])));
      if (q.lim) rs = rs.slice(0, q.lim);
      return { data: structuredClone(rs), count: rs.length, error: null };
    };
    const b = {
      select() { return b; },
      insert(row) { q.op = 'insert'; q.row = row; return b; },
      update(patch) { q.op = 'update'; q.patch = patch; return b; },
      eq(c, v) { q.filters.push(r => r[c] === v); return b; },
      gte(c, v) { q.filters.push(r => String(r[c]) >= String(v)); return b; },
      order(c, o = {}) { q.ord = [c, o.ascending !== false]; return b; },
      limit(k) { q.lim = k; return b; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }); },
      single() { return b.maybeSingle(); },
      then(ok, bad) { return Promise.resolve(run()).then(ok, bad); }
    };
    return b;
  };
  return { T, from };
}

function setup({ ai = 'Ролики — от 15 000 ₽. Расскажите о задаче?', aiAllowed = true } = {}) {
  const sb = fakeDb();
  const sent = [], notes = [];
  const deps = { sb, ai: async () => ai, aiAllowed: async () => aiAllowed, facts: async () => [], notify: async t => { notes.push(t); }, today: () => '2026-10-18' };
  const ch = {
    name: 'ВКонтакте', key: 'vk_peer_id', source: 'ВКонтакте-бот',
    send: async (id, text, kb) => { sent.push({ id, text, kb }); return String(9000 + sent.length); },
    profile: async id => ({ name: 'Мария Петрова', link: `https://vk.com/id${id}` })
  };
  return { sb, deps, ch, sent, notes, cfg: { ai_enabled: true, brief_questions: [], portfolio_videos: [] } };
}
const msgs = (sb, dir) => sb.T.messages.filter(m => !dir || m.direction === dir);

// --- новый человек пишет сообществу
{
  const { sb, deps, ch, sent, notes, cfg } = setup();
  await handleIncoming(deps, ch, cfg, { id: 501, kind: 'text', text: 'Здравствуйте, сколько стоит ролик?', messageId: '11' });
  const p = sb.T.prospects[0];
  check('новый собеседник — компания в «Поиске клиентов»', p && p.vk_peer_id === 501 && p.name === 'Мария Петрова' && p.source === 'ВКонтакте-бот' && p.socials === 'https://vk.com/id501');
  check('сначала приветствие с меню, потом ответ ИИ', sent.length === 2 && sent[0].kb === MAIN_KB && sent[1].text.startsWith('Ролики'));
  check('всё записано в переписку', msgs(sb, 'in').length === 1 && msgs(sb, 'out').length === 2 && msgs(sb, 'out')[1].author === 'ИИ' && msgs(sb, 'out')[1].external_id === '9002');
  check('непрочитанное — одно входящее', p.unread === 1 && p.last_direction === 'out');

  await handleIncoming(deps, ch, cfg, { id: 501, kind: 'text', text: 'Здравствуйте, сколько стоит ролик?', messageId: '11' });
  check('повтор того же события ВКонтакте не задваивает', msgs(sb).length === 3 && sent.length === 2);

  // анкета до заявки
  const step = (ev, id) => handleIncoming(deps, ch, cfg, { id: 501, messageId: String(id), ...ev });
  await step({ kind: 'button', data: 'm:brief' }, 12);
  check('кнопка «Оставить заявку» запускает анкету', sent.at(-1).text.includes('Короткая анкета') && sb.T.prospects[0].bot_state.mode === 'brief');
  await step({ kind: 'text', text: 'Кофейня на Ленина' }, 13);
  await step({ kind: 'text', text: 'р' }, 14);
  check('на шаге с кнопками одна буква не принимается', sb.T.prospects[0].bot_state.step === 1);
  await step({ kind: 'button', data: 'bf:Клипы / Reels' }, 15);
  await step({ kind: 'text', text: 'Пермь' }, 16);
  await step({ kind: 'button', data: 'bb:до 30 000 ₽' }, 17);
  await step({ kind: 'text', text: 'Мария' }, 18);
  await step({ kind: 'text', text: '+7 900 111-22-33' }, 19);
  const lead = sb.T.leads[0];
  check('заполненная анкета — заявка в воронке', lead && lead.source === 'ВКонтакте' && lead.name === 'Мария' && lead.amount === 15000
    && lead.next_on === '2026-10-18' && lead.next_step === 'Связаться по анкете из ВКонтакте' && lead.request.includes('Клипы'));
  const pp = sb.T.prospects[0];
  check('компания — «Заявка», диалог переходит к менеджеру', pp.status === 'Заявка' && pp.lead_id === lead.id && pp.bot_mode === 'human' && pp.phone === '+7 900 111-22-33');
  check('менеджеру — уведомление о заявке', notes.some(t => t.includes('Новая заявка из ВКонтакте')));
  check('в переписке — карточка анкеты', msgs(sb).some(m => m.kind === 'brief_complete' && m.meta.brief.city === 'Пермь'));

  // менеджер ведёт диалог — бот молчит
  const before = sent.length;
  await step({ kind: 'text', text: 'А когда сможете приехать?' }, 20);
  check('в режиме менеджера бот не отвечает, а сообщает менеджеру', sent.length === before && notes.at(-1).includes('А когда сможете приехать?'));

  // ответ админа прямо во ВКонтакте
  await recordManual(sb, ch, 501, 'Приедем в четверг', '777');
  await recordManual(sb, ch, 501, 'Приедем в четверг', '777');
  check('ответ админа во ВКонтакте попал в переписку один раз', msgs(sb, 'out').filter(m => m.text === 'Приедем в четверг').length === 1
    && msgs(sb, 'out').find(m => m.text === 'Приедем в четверг').author === 'менеджер в ВКонтакте');
  const last = msgs(sb, 'out').find(m => m.external_id === '9002');
  await recordManual(sb, ch, 501, last.text, '9002');
  check('своё сообщение бота второй раз не записывается', msgs(sb, 'out').filter(m => m.external_id === '9002').length === 1);
  await recordManual(sb, ch, 999, 'Кому-то', '1');
  check('ответ незнакомому — не создаёт компанию', sb.T.prospects.length === 1);
}

// --- без ИИ, вложения, голосовые
{
  const { sb, deps, ch, sent, notes, cfg } = setup({ aiAllowed: false });
  await handleIncoming(deps, ch, cfg, { id: 7, kind: 'text', text: '📎 фото', attachment: true, messageId: '1' });
  check('картинка без подписи: приветствие, без ИИ, менеджеру — сигнал', sent.length === 1 && sent[0].kb === MAIN_KB && notes.at(-1).includes('📎'));
  await handleIncoming(deps, ch, cfg, { id: 7, kind: 'text', text: 'Есть кто?', messageId: '2' });
  check('ИИ выключен или исчерпан: вежливо передаём менеджеру', sent.at(-1).text.startsWith('Спасибо! Передал менеджеру') && notes.at(-1).includes('Есть кто?'));
  await handleIncoming(deps, ch, cfg, { id: 7, kind: 'voice', transcribe: async () => '', messageId: '3' });
  check('голосовое не разобрали — просим написать текстом', msgs(sb).some(m => m.kind === 'voice') && sent.at(-1).text.includes('текстом'));
  await handleIncoming(deps, ch, cfg, { id: 7, kind: 'voice', transcribe: async () => '/brief', messageId: '4' });
  check('разобранное голосовое работает как текст', sent.at(-1).text.includes('Короткая анкета'));
}

// --- меню словами
{
  const { deps, ch, sent, cfg } = setup();
  await handleIncoming(deps, ch, cfg, { id: 8, kind: 'text', text: 'Примеры работ', messageId: '1' });
  check('«Примеры работ» словами — сразу примеры, без ИИ', sent.length === 1 && sent[0].text.includes('Наши работы'));
  await handleIncoming(deps, ch, cfg, { id: 8, kind: 'text', text: 'А как оставить заявку?', messageId: '2' });
  check('вопрос про заявку — ответ ИИ, а не анкета', sent.at(-1).text.startsWith('Ролики'));
  await handleIncoming(deps, ch, cfg, { id: 8, kind: 'text', text: 'заявка', messageId: '3' });
  check('«заявка» словами — анкета', sent.at(-1).text.includes('Короткая анкета'));
}

// --- разбор событий ВКонтакте
const vkMsg = (m, type = 'message_new') => ({ type, group_id: 1, object: type === 'message_new' ? { message: m } : m });
const t1 = parseVk(vkMsg({ id: 55, peer_id: 501, from_id: 501, text: ' Привет ' }));
check('ВК: текст из личных сообщений', t1.type === 'text' && t1.peerId === 501 && t1.text === 'Привет' && t1.messageId === '55');
check('ВК: беседы пропускаются', parseVk(vkMsg({ id: 1, peer_id: 2000000001, from_id: 501, text: 'x' })).type === 'skip');
check('ВК: «Начать» — это /start', parseVk(vkMsg({ id: 2, peer_id: 5, from_id: 5, text: 'Начать', payload: '{"command":"start"}' })).text === '/start');
const b1 = parseVk(vkMsg({ id: 3, peer_id: 5, from_id: 5, text: '📋 Оставить заявку', payload: '{"b":"m:brief"}' }));
check('ВК: кнопка бота — нажатие с данными', b1.type === 'button' && b1.data === 'm:brief');
check('ВК: чужой payload — обычный текст', parseVk(vkMsg({ id: 4, peer_id: 5, from_id: 5, text: 'x', payload: 'не json' })).type === 'text');
const v1 = parseVk(vkMsg({ id: 5, peer_id: 5, from_id: 5, text: '', attachments: [{ type: 'audio_message', audio_message: { link_ogg: 'https://psv4.userapi.com/a.ogg' } }] }));
check('ВК: голосовое — ссылкой на файл', v1.type === 'voice' && v1.url.endsWith('a.ogg'));
const a1 = parseVk(vkMsg({ id: 6, peer_id: 5, from_id: 5, text: '', attachments: [{ type: 'photo' }, { type: 'photo' }, { type: 'doc' }] }));
check('ВК: вложения без текста — отметка', a1.type === 'text' && a1.attachment && a1.text === '📎 фото, файл');
const r1 = parseVk(vkMsg({ id: 70, peer_id: 5, from_id: -1, admin_author_id: 42, text: 'Ответ' }, 'message_reply'));
check('ВК: ответ админа из интерфейса отмечен как ручной', r1.type === 'reply' && r1.manual && r1.messageId === '70');
check('ВК: ответ через API — не ручной', parseVk(vkMsg({ id: 71, peer_id: 5, from_id: -1, text: 'бот' }, 'message_reply')).manual === false);
check('ВК: прочие события пропускаются', parseVk({ type: 'wall_post_new', object: {} }).type === 'skip' && parseVk(null).type === 'skip');

// --- клавиатура ВКонтакте
const kb = JSON.parse(vkKeyboard(MAIN_KB));
check('ВК-клавиатура: встроенная, кнопки с данными', kb.inline === true && kb.buttons.length === 4
  && JSON.parse(kb.buttons[1][0].action.payload).b === 'm:brief' && kb.buttons[1][0].color === 'primary');
const big = JSON.parse(vkKeyboard(portfolioReply('', ['https://a.ru/1', 'https://a.ru/2', 'https://a.ru/3', 'https://a.ru/4', 'https://a.ru/5']).keyboard));
check('ВК-клавиатура: больше шести рядов — по две в ряд, не больше десяти', big.buttons.length <= 6 && big.buttons.flat().length === 7
  && big.buttons.flat().every(b => b.action.label.length <= 40) && big.buttons[0][0].action.type === 'open_link');
check('ВК-клавиатура: нет клавиатуры — пусто', vkKeyboard(undefined) === '');

// --- Telegram: вложения
const ph = parseUpdate({ message: { message_id: 1, chat: { id: 3, type: 'private' }, photo: [{}] } });
check('Telegram: фото без подписи — отметка о вложении', ph.type === 'text' && ph.attachment && ph.text === '📎 фото');
const cap = parseUpdate({ message: { message_id: 2, chat: { id: 3, type: 'private' }, document: {}, caption: 'ТЗ во вложении' } });
check('Telegram: подпись к файлу — как текст', cap.type === 'text' && !cap.attachment && cap.text === 'ТЗ во вложении');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
