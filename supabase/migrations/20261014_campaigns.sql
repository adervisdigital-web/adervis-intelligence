-- ADERVIS Intelligence · рекламные кампании
--
-- Бюджет по каналу за месяц (ad_budget) отвечал только на вопрос «сколько
-- ушло в ВКонтакте». Реклама же живёт кампаниями: у каждой своя цель,
-- сроки, креатив и ссылка с UTM-метками. Кампания становится единицей
-- рекламы, заявка привязывается к кампании — и видно, какое именно
-- объявление принесло обращение.

create table if not exists public.campaigns (
  id           text primary key default gen_random_uuid()::text,
  name         text not null check (length(name) between 1 and 120),
  channel      text not null check (length(channel) between 1 and 60),
  direction    text not null default 'Студия' check (direction in ('Студия', 'CRM', 'Stock', 'Медиа')),
  goal         text not null default 'Заявки' check (length(goal) between 1 and 60),
  status       text not null default 'Готовим' check (status in ('Готовим', 'Идёт', 'Пауза', 'Завершена')),
  starts_on    date not null default current_date,
  ends_on      date,
  budget       integer not null default 0 check (budget >= 0),
  spent        integer not null default 0 check (spent >= 0),
  audience     text not null default '' check (length(audience) <= 500),
  creative     text not null default '' check (length(creative) <= 1000),
  landing      text not null default '' check (length(landing) <= 500),
  utm_medium   text not null default 'cpc' check (length(utm_medium) between 1 and 40),
  utm_campaign text not null check (utm_campaign ~ '^[a-z0-9_-]{1,60}$'),
  utm_content  text not null default '' check (utm_content ~ '^[a-z0-9_-]{0,60}$'),
  note         text not null default '' check (length(note) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   text,
  check (ends_on is null or ends_on >= starts_on)
);

create index if not exists campaigns_status_idx on public.campaigns (status, starts_on desc);

-- Заявка может быть привязана к кампании. Удалили кампанию — заявка
-- остаётся, просто без привязки.
alter table public.leads add column if not exists campaign_id text
  references public.campaigns(id) on delete set null;
create index if not exists leads_campaign_idx on public.leads (campaign_id);

drop trigger if exists touch_row on public.campaigns;
create trigger touch_row before insert or update on public.campaigns
  for each row execute function public.touch();

drop trigger if exists log_row on public.campaigns;
create trigger log_row after insert or update or delete on public.campaigns
  for each row execute function public.log_activity();

alter table public.campaigns enable row level security;
drop policy if exists members_all on public.campaigns;
create policy members_all on public.campaigns for all to authenticated
  using (public.is_member()) with check (public.is_member());

grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.campaigns to service_role;
revoke all on public.campaigns from anon;

-- Бюджет по месяцам заменён кампаниями. Таблицу убираем, только если она
-- пустая: данные не удаляются молча ни при каких условиях.
do $$
begin
  if to_regclass('public.ad_budget') is not null then
    if (select count(*) from public.ad_budget) = 0 then
      drop table public.ad_budget;
    else
      raise notice 'ad_budget не пуста — оставлена как есть';
    end if;
  end if;
end $$;
