// Связь с ADERVIS CRM: шаблоны брифов студии и перенос брифа CRM в заявку и бриф.
import { ADERVIS_TEMPLATES, withTemplates, fromSubmission, briefLink, maskEmail, CRM_TYPES, sanitizePush, withDeal, findDeal, backChanges, CRM_WON, choiceDeal } from '../supabase/functions/_shared/crm.ts';

let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  -> ' + extra : '')); };

// шаблоны — в формате редактора CRM
for (const t of ADERVIS_TEMPLATES) {
  const ids = t.fields.map(f => f.id);
  check(`шаблон «${t.label}»: контакты для карточки клиента, одно описание, поля без повторов`,
    t.id.startsWith('own_') && ['name', 'email', 'phone'].every(sys => t.fields.some(f => f.system === sys))
    && t.fields.filter(f => f.primary).length === 1 && new Set(ids).size === ids.length && t.fields.some(f => f.id === 'budget'));
}

// запись шаблонов не трогает остального
const crmState = { clients: [{ id: 'c1' }], customBriefTypes: [{ id: 'own_x', label: 'Свадьба' }], briefTemplates: { video: { title: 'Своё видео', fields: [{ id: 'a' }] } } };
const next = withTemplates(crmState);
check('шаблоны ADERVIS добавлены, свои типы и правки студии на месте', next.customBriefTypes.length === 1 + ADERVIS_TEMPLATES.length
  && next.customBriefTypes[0].id === 'own_x' && next.briefTemplates.video.title === 'Своё видео' && next.clients.length === 1
  && next.briefTemplates.own_adv_motion.fields.length > 5);
check('повторная запись не задваивает', withTemplates(next).customBriefTypes.length === next.customBriefTypes.length);
const full = withTemplates({ customBriefTypes: Array.from({ length: 6 }, (_, i) => ({ id: 'own_' + i, label: 'Т' + i })) });
check('не больше восьми своих типов — как требует CRM', full.customBriefTypes.length === 8);
check('исходное состояние не меняется', crmState.customBriefTypes.length === 1);

// бриф CRM → заявка и бриф
const sub = { id: 'abc', client_name: 'Анастасия', client_phone: '+7 900 1', client_email: 'a@uralchem.ru', project_type: 'Моушн-бриф',
  description: 'Пакет графики для дайджеста\nКомпания: Химпром\nГде будет показываться: YouTube / корпоративное ТВ', budget: '200 000 – 500 000 ₽',
  deadline: '2026-11-20', submitted_at: '2026-10-20T05:00:00Z' };
const { lead, brief } = fromSubmission(sub, '2026-10-20');
check('заявка: компания и имя, источник «Бриф CRM», шаг на сегодня', lead.name === 'Химпром — Анастасия' && lead.source === 'Бриф CRM'
  && lead.next_on === '2026-10-20' && lead.status === 'Новое' && lead.note.includes('a@uralchem.ru'));
check('бриф: номер CRM для защиты от повтора, связь с заявкой, шаг «Разбор»', brief.crm_id === 'abc' && brief.lead_id === lead.id && brief.stage === 'Разбор'
  && brief.client === 'Химпром' && brief.title === 'Моушн: Химпром');
check('текст брифа: контакты, бюджет, срок и ответы клиента', brief.source_text.includes('Бюджет: 200 000') && brief.source_text.includes('Срок: 2026-11-20')
  && brief.source_text.includes('Пакет графики для дайджеста'));
check('без имени — понятная подпись', fromSubmission({ id: 'x', description: '' }, '2026-10-20').lead.name === 'Клиент из брифа');

check('ссылка на бриф CRM', briefLink('ag-1', 'video') === 'https://crm.adervis.ru/?brief=ag-1&type=video' && CRM_TYPES.length === 5);
check('почта в настройках — скрыта', maskEmail('adervis.digital@gmail.com') === 'ad***@gmail.com');

// бриф со сметой → клиент и сделка в CRM
const raw = { briefId: 'brief-1', name: 'Два AI-ролика', client: 'ООО «СтройГрупп»', contact: 'Олег Петров', email: 'Petrov.O@pinepark.example',
  phone: '+7 900 555 0123', status: 'Бриф', notes: 'Из Intelligence', lines: [{ name: 'Сценарий', price: 30000, note: 'Ролик 1' }, { name: 'Генерация', price: 70000, note: 'Ролик 1' }, { name: 'Пусто', price: 0 }] };
const p = sanitizePush(raw);
check('отправка: строки без цены отброшены, сумма — по строкам, почта в нижнем регистре', p.lines.length === 2 && p.total === 100000 && p.email === 'petrov.o@pinepark.example');
check('отправка: без строк — понятная ошибка', /нет строк/.test((() => { try { sanitizePush({ briefId: 'x', lines: [] }); } catch (e) { return e.message; } })()));
check('отправка: чужой статус заменён на «Бриф»', sanitizePush({ ...raw, status: 'Взлом' }).status === 'Бриф');
const before = { clients: [{ id: 'c0', name: 'Другой' }], savedProjects: [{ id: 'old', name: 'Старая' }], company: { name: 'ADERVIS' } };
const r1 = withDeal(before, p, { deal: 'proj_1', client: 'client_1' }, '2026-10-22T10:00:00Z');
const deal = r1.state.savedProjects[0];
check('сделка: создана первой, со своей ссылкой на бриф, суммой и статусом', r1.mode === 'created' && deal.id === 'proj_1' && deal.intelBriefId === 'brief-1'
  && deal.total === 100000 && deal.crmStatus === 'Бриф' && r1.state.savedProjects.length === 2);
check('сделка: смета — черновиком CRM, CRM развернёт её сама', deal.botEstimate.lines.length === 2 && deal.botEstimate.lines[0].qty === 1
  && deal.botEstimate.lines[1].price === 70000 && deal.botEstimate.mismatch === 0);
check('клиент: заведён с контактами и источником, привязан к сделке', r1.clientCreated && r1.state.clients[0].email === 'petrov.o@pinepark.example'
  && r1.state.clients[0].source === 'Hub ADERVIS' && deal.clientId === 'client_1');
check('остальное состояние CRM не тронуто', r1.state.company.name === 'ADERVIS' && before.savedProjects.length === 1 && before.clients.length === 1);
const r2 = withDeal(r1.state, { ...p, lines: [{ name: 'Всё', price: 120000, note: '' }], total: 120000 }, { deal: 'proj_2', client: 'client_2' }, '2026-10-23T10:00:00Z', 'proj_1');
check('повторная отправка обновляет ту же сделку и того же клиента', r2.mode === 'updated' && r2.dealId === 'proj_1' && !r2.clientCreated
  && r2.state.savedProjects.length === 2 && r2.state.savedProjects[0].total === 120000 && r2.state.clients.length === 2);
const byPhone = withDeal({ clients: [{ id: 'cp', name: 'Олег', phone: '8 (900) 555-01-23' }] }, { ...p, email: '' }, { deal: 'd', client: 'c' }, 'now');
check('клиент находится по телефону в любом написании', !byPhone.clientCreated && byPhone.clientId === 'cp');
const done = { savedProjects: [{ id: 'proj_1', intelBriefId: 'brief-1', snapshot: { selected: { custom_1: { qty: 1 } } } }] };
check('развёрнутую в CRM смету не трогаем', /уже развёрнута/.test((() => { try { withDeal(done, p, { deal: 'x', client: 'y' }, 'now'); } catch (e) { return e.message; } })()));

// сделка из CRM → бриф и заявка в Hub
const crmSt = { savedProjects: [
  { id: 'proj_1', intelBriefId: 'brief-1', crmStatus: 'Предоплата', total: 200000, paid: 100000 },
  { id: 'proj_9', intelBriefId: 'brief-9', crmStatus: 'Бриф', total: 50000 } ] };
const d1 = findDeal(crmSt, { id: 'brief-1', crm_deal_id: 'proj_1' });
check('сделка CRM находится по номеру; стадия, сумма и оплата читаются', d1 && d1.status === 'Предоплата' && d1.total === 200000 && d1.paid === 100000);
check('без номера — по отметке брифа; нет сделки — null', findDeal(crmSt, { id: 'brief-9' })?.dealId === 'proj_9' && findDeal(crmSt, { id: 'brief-x', crm_deal_id: 'nope' }) === null);
const b1 = { id: 'brief-1', stage: 'Переговоры', crm_deal_id: 'proj_1', crm_status: 'Бриф', crm_total: 200000, crm_paid: 0 };
const c1 = backChanges(b1, { id: 'l1', status: 'В работе', amount: 0 }, d1, 'now');
check('состоялась в CRM — бриф и заявка в «Сделку», сумма заявки из CRM', c1.briefPatch.stage === 'Сделка' && c1.briefPatch.crm_status === 'Предоплата'
  && c1.leadPatch.status === 'Сделка' && c1.leadPatch.amount === 200000 && c1.becameWon && c1.paidNow === 100000 && c1.briefPatch.crm_synced_at === 'now');
const same = backChanges({ ...b1, stage: 'Сделка', crm_status: 'Предоплата', crm_paid: 100000 }, { status: 'Сделка', amount: 200000 }, d1, 'now');
check('ничего не изменилось — ничего не пишем и не шлём', !Object.keys(same.briefPatch).length && !Object.keys(same.leadPatch).length && !same.becameWon && same.paidNow === 0);
const more = backChanges({ ...b1, stage: 'Сделка', crm_status: 'Предоплата', crm_paid: 100000 }, null, { ...d1, status: 'В работе', paid: 150000 }, 'now');
check('новая оплата — сколько пришло, без повторного «состоялась»', more.paidNow === 50000 && !more.becameWon && more.briefPatch.crm_paid === 150000 && !more.briefPatch.stage);
const lost = backChanges({ ...b1, stage: 'Отказ' }, { status: 'Отказ', amount: 0 }, d1, 'now');
check('«Отказ» в Hub не перетираем', !lost.briefPatch.stage && !lost.leadPatch.status);
const early = backChanges({ id: 'brief-9', stage: 'КП', crm_deal_id: 'proj_9' }, { status: 'Новое', amount: 0 }, findDeal(crmSt, { id: 'brief-9' }), 'now');
check('ранняя стадия CRM — бриф не двигаем, заявку не трогаем', !early.briefPatch.stage && !Object.keys(early.leadPatch).length && early.briefPatch.crm_status === 'Бриф'
  && CRM_WON.includes('Договор') && !CRM_WON.includes('Согласование'));

// выбор клиента в КП → сделка «Согласование»
const snap = { title: 'Ролик для выставки', client: 'Завод', estimate: { two: true, full: 300000, base: 200000,
  groups: [{ name: 'Съёмка', rows: [{ name: 'Оператор', full: 120000, base: 100000 }, { name: 'Свет', full: 60000, base: null }] },
    { name: 'Монтаж', rows: [{ name: 'Монтаж', full: 120000, base: 100000 }] }], options: [{ name: 'Субтитры: 2 языка', price: 15000 }] } };
const chB = { variant: 'base', label: 'Базовый вариант', price: 200000, options: [{ name: 'Субтитры: 2 языка', price: 15000 }], total: 215000, comment: 'Старт в ноябре' };
const pb = sanitizePush(choiceDeal(snap, chB, { id: 'brief-7', title: 'Ролик', client: 'Завод' }, 'Олег, oleg@zavod.example, +7 900 111-22-33'));
check('выбор «базовый»: строки базового варианта + выбранная опция, итог как у клиента', pb.total === 215000 && pb.lines.length === 3
  && !pb.lines.some(l => l.name === 'Свет') && pb.lines[2].note.startsWith('Дополнительно') && pb.status === 'Согласование');
check('контакты из заявки и комментарий клиента — в сделку', pb.email === 'oleg@zavod.example' && /900/.test(pb.phone) && /Старт в ноябре/.test(pb.notes) && /Базовый вариант \+ Субтитры/.test(pb.notes));
const pf = sanitizePush(choiceDeal(snap, { variant: 'full', label: 'Полный вариант', price: 300000, options: [], total: 300000 }, { id: 'b', title: 'Ролик' }));
check('выбор «полный»: все строки полного', pf.total === 300000 && pf.lines.length === 3);
const old = sanitizePush(choiceDeal({ title: 'Старое КП', estimate: { full: 90000 } }, { variant: 'full', label: 'Смета', price: 90000, options: [] }, { id: 'b' }));
check('старый снимок без строк — одна строка на всю сумму', old.lines.length === 1 && old.total === 90000 && old.lines[0].name === 'Старое КП');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
