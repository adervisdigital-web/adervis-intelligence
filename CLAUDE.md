# Hub ADERVIS (бывший ADERVIS Intelligence) — карта проекта

Адрес: https://hub.adervis.ru (GitHub Pages, домен в reg.ru: CNAME hub → adervisdigital-web.github.io).

Рабочая программа студии ADERVIS: заявки, брифы и КП, диалоги с ботом продаж, поиск клиентов, реклама, контент-план, метрики, база знаний. Интерфейс по-русски. Сайт — GitHub Pages из `main` (публичный репозиторий: внутренних данных студии в коде и тестах нет). Сервер — Supabase (база, edge-функции, pg_cron).

## Файлы
- `app.js` — всё приложение, vanilla JS в одной IIFE. Разделы помечены строками `// ---- <раздел>`; ищите по ним, не читая файл целиком.
- `style.css` — стили; новые слои дописываются в конец файла.
- `index.html`, `config.js` (адрес и публичный ключ Supabase), `icons-data.js` (иконки — `icon('name', size)`), `brand/`.
- `survey-*-data.js` — анкеты владельцев.
- `supabase/migrations/*.sql` — схема (RLS через `is_member()`), `supabase/cron/digest.sql` — расписания.
- `supabase/functions/` — edge-функции: `ai-write` (ИИ: тексты, план, посты, разбор ТЗ, расшифровка голоса), `channels`, `tg-bot`, `vk-bot`, `intel-bot` (служебный бот: сводка и приём заявок), `digest`, `crm` (связь с ADERVIS CRM), `feed`, `prospect`, `publish`. Общий код — `_shared/` (`bot.ts`, `flow.ts`, `outreach.ts`, `crm.ts`, `intake.ts`, `brief-ai.ts`, `digest*.ts`).
- `ai-write/compose.ts`, `feed/`, `prospect/`, `publish/` собираются в `bundle.ts` командой `node tools/bundle.mjs` — после правок пересобрать.

## Разделы app.js (по заголовкам)
утилиты · обращения к базе (`FIELDS`/`SERVER_FIELDS`, `toRow`/`fromRow`, `api.*`, `callFn`) · состояние (`db`, `emptyDb`) · отрисовка (`render`, `go`, NAV) · контент-план (`renderContentPlan`, `planTable`, `planPulse`, `editP`, `caseForm`, `aiWriteAll`) · воронка · на сегодня (`todayList`) · поиск клиентов · диалоги · брифы и КП (`renderBrief`, `bfEstimate`, `estimateDoc`/`estimateText`/`estimateXlsx`/`estimateHtml`, `kpHtml`, `crmPushPayload`, `briefAi`, `editBrief`) · ADERVIS CRM (`crmModal`) · утренняя сводка (`digestModal`) · анкета · ключевые фразы · окна и формы (`modal`, `submitForm`) · заявки · действия (общий обработчик `click` и `briefAction` для `bf*`/`kp*`) · запуск (ссылки `#brief=<id>`, `#channels-vk`).

## Проверка и выкладка
- Тесты: `cd tests && npm test` (база в PGlite, промпты, боты, CRM, приём заявок, UI на Playwright с подменным API `window.__INTEL_API__` в `tests/ui.test.mjs`). Перед коммитом — все зелёные. Тестовые данные — `tests/fixtures/seed.json` (обезличенные).
- UI-тест идёт одним сценарием: новые проверки вставлять в нужный раздел и возвращать состояние (тему, фильтры), которое меняли.
- Миграция: `supabase db query --linked -f supabase/migrations/<файл>.sql`.
- Функции: `supabase functions deploy <имя> --use-api`; `tg-bot`, `vk-bot`, `intel-bot`, `digest`, `crm` — с `--no-verify-jwt` (сами проверяют доступ).
- Выкладка сайта — `git push origin main`; GitHub Actions гоняет тесты.

## Правила
- Код сайта ADERVIS, ADERVIS CRM и ADERVIS Stock не меняем — только читаем. В CRM пишем входом студии, состояние меняем с проверкой версии и будим открытые вкладки сигналом `state-sync`.
- Ключи и пароли — только в `channel_secrets` / секретах Supabase через интерфейс; в коде, чате и логах их нет.
- Тексты для клиентов — только по проверенным фактам базы знаний; клиентов называем публично только с разрешения.
- Смета для клиента — без часов и ставок студии; итог всегда равен цене из КП.
