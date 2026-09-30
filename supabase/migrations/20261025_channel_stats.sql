-- ADERVIS Intelligence · статистика площадок по месяцам
--
-- Выгрузка статистики сообщества ВКонтакте (CSV) загружается в «Метрики»:
-- одна строка — один месяц площадки. Повторная загрузка того же месяца
-- заменяет его, а не дублирует: номер строки — площадка и месяц.

create table if not exists public.channel_stats (
  id            text primary key check (id ~ '^[a-z]+-\d{4}-\d{2}$'),
  network       text not null default 'ВКонтакте' check (length(network) between 1 and 40),
  month         date not null,
  reach         integer not null default 0 check (reach >= 0),
  reach_nonsubs integer not null default 0 check (reach_nonsubs >= 0),
  reach_posts   integer not null default 0 check (reach_posts >= 0),
  reach_clips   integer not null default 0 check (reach_clips >= 0),
  views         integer not null default 0 check (views >= 0),
  likes         integer not null default 0 check (likes >= 0),
  shares        integer not null default 0 check (shares >= 0),
  comments      integer not null default 0 check (comments >= 0),
  subs          integer not null default 0 check (subs >= 0),
  subs_in       integer not null default 0 check (subs_in >= 0),
  subs_out      integer not null default 0 check (subs_out >= 0),
  visitors      integer not null default 0 check (visitors >= 0),
  site_clicks   integer not null default 0 check (site_clicks >= 0),
  new_dialogs   integer not null default 0 check (new_dialogs >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    text
);

drop trigger if exists touch_row on public.channel_stats;
create trigger touch_row before insert or update on public.channel_stats
  for each row execute function public.touch();

alter table public.channel_stats enable row level security;
drop policy if exists members_all on public.channel_stats;
create policy members_all on public.channel_stats for all to authenticated
  using (public.is_member()) with check (public.is_member());
grant select, insert, update, delete on public.channel_stats to authenticated;
grant select, insert, update, delete on public.channel_stats to service_role;
revoke all on public.channel_stats from anon;

-- Разбор трёхлетней выгрузки 30.09.2026 — в базу знаний, для решений.
insert into public.knowledge (id, title, body, category, source, access, status) values
('k-vk-stats-2026-09', 'ВКонтакте за три года: статистика окт 2023 — сен 2026', $b$По выгрузке статистики сообщества (vk.ru/adervis_digital), годы — с октября по сентябрь.

Подписчики
1 880 → 2 244 за три года. Прирост тает: +201, +138, +25 за год.

Охват (сумма месячных)
20,8 тыс. → 32,6 тыс. → 10,7 тыс. Лучший месяц — апрель 2025, 16,3 тыс.: почти весь его дали клипы (7,9 тыс.). Следующие — март 2024 (4,5 тыс.) и май 2026 (4,0 тыс.).

Кто видит
84% охвата — не подписчики. Сами 2,2 тыс. подписчиков посты почти не видят: база подписчиков по сути неживая, охват приносит рекомендательная лента.

Провалы
Восемь месяцев с охватом меньше 300, из них пять подряд — октябрь 2025 — февраль 2026. Когда нет постов, охват падает почти до нуля: сообщество не живёт без регулярной публикации.

Продажи
Кнопка «Перейти на сайт» — 0 нажатий за три года. Новых диалогов — 8, все за последний год. Сейчас сообщество не приводит клиентов ни на сайт, ни в сообщения.

Что из этого следует
— Клипы — единственное, что давало скачок охвата. Делать клипы из кейсов регулярно.
— Регулярность важнее разовых всплесков: провалы съедают всё, что набрали.
— Каждый пост должен вести к действию: сообщение сообществу, лид-магнит, ссылка с меткой. Иначе охват не превращается в заявки.
— Кнопку действия проверить: ноль нажатий за три года — либо её не видно, либо она ведёт не туда.$b$,
'Каналы', 'Выгрузка статистики ВКонтакте, 01.10.2023 — 30.09.2026', 'Внутреннее', 'Подтверждено')
on conflict (id) do nothing;
