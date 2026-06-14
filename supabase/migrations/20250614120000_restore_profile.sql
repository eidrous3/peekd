-- Restore soft-deleted profile when a user signs back in (returns true if reactivated)

drop policy if exists "Profiles: restore own" on public.profiles;
create policy "Profiles: restore own"
  on public.profiles for update
  using (auth.uid() = id and is_deleted)
  with check (auth.uid() = id and not is_deleted);

create or replace function public.restore_profile()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rows_updated integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
  set is_deleted = false,
      updated_at = now()
  where id = uid
    and is_deleted = true;

  get diagnostics rows_updated = row_count;
  return rows_updated > 0;
end;
$$;

revoke all on function public.restore_profile() from public;
grant execute on function public.restore_profile() to authenticated;
