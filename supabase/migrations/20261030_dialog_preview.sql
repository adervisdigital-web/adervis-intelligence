-- ADERVIS Intelligence · последнее сообщение диалога — для списка «Диалоги»

alter table public.prospects
  add column if not exists last_text      text not null default '' check (length(last_text) <= 160),
  add column if not exists last_direction text not null default '' check (last_direction in ('', 'in', 'out'));

create or replace function public.message_touch_prospect() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.prospects
     set last_message_at = new.created_at,
         last_text = left(new.text, 160),
         last_direction = new.direction,
         unread = case when new.direction = 'in' then unread + 1 else unread end
   where id = new.prospect_id;
  return null;
end $$;
