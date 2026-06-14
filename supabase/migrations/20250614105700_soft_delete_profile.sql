-- Soft-delete profile via RPC (bypasses RLS read-back issues after is_deleted = true)

alter table public.profiles
  add column if not exists is_deleted boolean not null default false;

drop policy if exists "Profiles: soft delete own" on public.profiles;
create policy "Profiles: soft delete own"
  on public.profiles for update
  using (auth.uid() = id and not is_deleted)
  with check (auth.uid() = id and is_deleted = true);

create or replace function public.soft_delete_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
  set is_deleted = true,
      updated_at = now()
  where id = uid
    and not is_deleted;

  if not found then
    insert into public.profiles (id, is_deleted)
    values (uid, true)
    on conflict (id) do update
      set is_deleted = true,
          updated_at = now()
    where public.profiles.is_deleted = false;
  end if;
end;
$$;

revoke all on function public.soft_delete_profile() from public;
grant execute on function public.soft_delete_profile() to authenticated;
