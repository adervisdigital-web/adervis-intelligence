-- КП-ссылка: старая вкладка программы не может перезаписать страницу
-- снимком прежней версии (data.v меньше, чем уже опубликованный).
create or replace function public.kp_shares_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce((old.data->>'v')::int, 1) > coalesce((new.data->>'v')::int, 1) then
    raise exception 'Открыта старая версия программы. Обновите страницу (F5) и опубликуйте снова.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists kp_shares_version on public.kp_shares;
create trigger kp_shares_version before update on public.kp_shares
  for each row execute function public.kp_shares_version();
