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
language sql
security definer
set search_path = public
as $$
  insert into public.profiles (id, is_deleted)
  values (auth.uid(), true)
  on conflict (id) do update
    set is_deleted = true,
        updated_at = now();
$$;

revoke all on function public.soft_delete_profile() from public;
grant execute on function public.soft_delete_profile() to authenticated;
