-- Restore soft-deleted profile when a user signs back in

drop policy if exists "Profiles: restore own" on public.profiles;
create policy "Profiles: restore own"
  on public.profiles for update
  using (auth.uid() = id and is_deleted)
  with check (auth.uid() = id and not is_deleted);

create or replace function public.restore_profile()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.profiles (id, is_deleted)
  values (auth.uid(), false)
  on conflict (id) do update
    set is_deleted = false,
        updated_at = now()
    where public.profiles.is_deleted = true;
$$;

revoke all on function public.restore_profile() from public;
grant execute on function public.restore_profile() to authenticated;
