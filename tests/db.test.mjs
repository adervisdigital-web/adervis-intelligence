import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));


const DIR = path.join(HERE, '..', 'supabase', 'migrations');
const SQL = fs.readdirSync(DIR).sort().map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  -> ' + extra : '')); };
const db = new PGlite();

// --- окружение, которое в Supabase уже есть: роли и auth.jwt().
// Автоматическое открытие новых таблиц в проекте выключено, поэтому права
// по умолчанию здесь не выдаются: доступ должна выдать сама миграция.
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create or replace function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
`);

await db.exec(SQL);
check('миграция выполняется без ошибок', true);

const as = async (role, email, sql, params) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claims', '${JSON.stringify({ email })}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
};
const fail = async (role, email, sql, params) => {
  try { await as(role, email, sql, params); return null; } catch (e) { return e.message; }
};

await db.exec(`insert into public.members(email, name) values ('artem@adervis.ru', 'Артём'), ('alex@adervis.ru', 'Александр');`);

// --- участник работает с данными
const K = `insert into public.knowledge(id,title,body,category,source,access,status)
           values ('k1','Позиционирование','Визуал для бизнеса','Компания','https://adervis.ru/','Публичное','Публичный источник')`;
await as('authenticated', 'artem@adervis.ru', K);
check('участник может создать запись', (await as('authenticated', 'artem@adervis.ru', 'select count(*)::int c from public.knowledge')).rows[0].c === 1);
check('updated_by заполняется сам',
  (await as('authenticated', 'artem@adervis.ru', 'select updated_by from public.knowledge')).rows[0].updated_by === 'artem@adervis.ru');

// --- посторонний с валидным логином не видит ничего
check('посторонний не видит записи', (await as('authenticated', 'stranger@gmail.com', 'select count(*)::int c from public.knowledge')).rows[0].c === 0);
check('посторонний не может писать', (await fail('authenticated', 'stranger@gmail.com', K.replace("'k1'", "'k2'"))) !== null);
check('посторонний не видит журнал', (await as('authenticated', 'stranger@gmail.com', 'select count(*)::int c from public.activity')).rows[0].c === 0);
check('посторонний не видит список участников', (await as('authenticated', 'stranger@gmail.com', 'select count(*)::int c from public.members')).rows[0].c === 0);

// --- неавторизованный посетитель
check('анониму закрыт доступ к записям', (await fail('anon', '', 'select * from public.knowledge')) !== null);
check('анониму закрыт доступ к участникам', (await fail('anon', '', 'select * from public.members')) !== null);
check('аноним не может вызвать is_member()', (await fail('anon', '', 'select public.is_member()')) !== null);

// --- журнал изменений
await as('authenticated', 'alex@adervis.ru', `update public.knowledge set body = 'Правка Александра' where id = 'k1'`);
const log = (await as('authenticated', 'artem@adervis.ru', 'select actor, entity, action, title from public.activity order by id')).rows;
check('журнал: создание и правка записаны', log.length === 2 && log[0].action === 'insert' && log[1].action === 'update', JSON.stringify(log));
check('журнал: виден автор правки', log[1].actor === 'alex@adervis.ru' && log[1].title === 'Позиционирование');

// --- публикация и замеры, каскадное удаление
await as('authenticated', 'artem@adervis.ru', `insert into public.content(id,title,body,product,author,channel,status,publish_on)
  values ('p1','Смета не заканчивается на сумме','Текст','CRM','Артём','Threads','Черновик','2026-09-22')`);
await as('authenticated', 'artem@adervis.ru', `insert into public.metrics(id,post,measured_on,views,replies,leads)
  values ('m1','p1','2026-09-24',1200,14,3)`);
check('замер с несуществующей публикацией отклоняется',
  (await fail('authenticated', 'artem@adervis.ru', `insert into public.metrics(id,post,measured_on,views,replies,leads) values ('m2','нет','2026-09-24',1,1,1)`)) !== null);
check('отрицательные просмотры отклоняются',
  (await fail('authenticated', 'artem@adervis.ru', `insert into public.metrics(id,post,measured_on,views,replies,leads) values ('m3','p1','2026-09-24',-5,0,0)`)) !== null);
await as('authenticated', 'artem@adervis.ru', `delete from public.content where id = 'p1'`);
check('удаление публикации уносит её замеры',
  (await as('authenticated', 'artem@adervis.ru', 'select count(*)::int c from public.metrics')).rows[0].c === 0);
const acts = (await as('authenticated', 'artem@adervis.ru', `select entity, action from public.activity where entity in ('content','metrics') order by id`)).rows;
const actSet = new Set(acts.map(a => a.entity + ':' + a.action));
check('журнал: удаление публикации и её замера записано',
  acts.length === 4 && ['content:insert', 'metrics:insert', 'metrics:delete', 'content:delete'].every(x => actSet.has(x)), JSON.stringify(acts));

// --- проверки значений
check('чужое значение «Использование» отклоняется',
  (await fail('authenticated', 'artem@adervis.ru', K.replace("'k1'", "'k9'").replace("'Публичное'", "'Секретное'"))) !== null);
check('пустое название отклоняется',
  (await fail('authenticated', 'artem@adervis.ru', K.replace("'k1'", "'k8'").replace("'Позиционирование'", "''"))) !== null);
check('почта участника только в нижнем регистре',
  (await fail('postgres', '', `insert into public.members(email,name) values ('Big@Mail.ru','Кто-то')`)) !== null);

// --- журнал нельзя подделать из приложения
check('участник не может писать в журнал',
  (await fail('authenticated', 'artem@adervis.ru', `insert into public.activity(actor,entity,entity_id,action) values ('кто-то','knowledge','k1','update')`)) !== null);
check('участник не может чистить журнал',
  (await fail('authenticated', 'artem@adervis.ru', `delete from public.activity`)) !== null);

// --- учёт обращений к ИИ
await db.exec(`insert into public.ai_usage(actor, model, drafts, chars) values ('artem@adervis.ru','gemini-2.5-flash',3,1200);`);
check('участник видит свой расход на ИИ',
  (await as('authenticated', 'artem@adervis.ru', 'select count(*)::int c from public.ai_usage')).rows[0].c === 1);
check('посторонний не видит расход на ИИ',
  (await as('authenticated', 'stranger@gmail.com', 'select count(*)::int c from public.ai_usage')).rows[0].c === 0);
check('анониму закрыт учёт расходов', (await fail('anon', '', 'select * from public.ai_usage')) !== null);
check('участник не может подделать свой счётчик',
  (await fail('authenticated', 'artem@adervis.ru', `insert into public.ai_usage(actor,model) values ('artem@adervis.ru','подделка')`)) !== null);
check('участник не может стереть счётчик',
  (await fail('authenticated', 'artem@adervis.ru', 'delete from public.ai_usage')) !== null);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
