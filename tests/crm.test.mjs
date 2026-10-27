// Связь с ADERVIS CRM: шаблоны брифов студии и перенос брифа CRM в заявку и бриф.
import { ADERVIS_TEMPLATES, withTemplates, fromSubmission, briefLink, maskEmail, CRM_TYPES, sanitizePush, withDeal } from '../supabase/functions/_shared/crm.ts';

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

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
