// Связь с ADERVIS CRM: шаблоны брифов студии и перенос брифа CRM в заявку и бриф.
import { ADERVIS_TEMPLATES, withTemplates, fromSubmission, briefLink, maskEmail, CRM_TYPES } from '../supabase/functions/_shared/crm.ts';

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

check('ссылка на бриф CRM', briefLink('ag-1', 'video') === 'https://app.adervis.ru/?brief=ag-1&type=video' && CRM_TYPES.length === 5);
check('почта в настройках — скрыта', maskEmail('adervis.digital@gmail.com') === 'ad***@gmail.com');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
