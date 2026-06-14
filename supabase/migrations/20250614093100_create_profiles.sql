-- Peekd user profiles (run in Supabase SQL Editor or via CLI migrate)
-- Email lives in auth.users — not stored here.

-- ── Table ───────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  timezone text not null default 'America/New_York',
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_timezone_not_empty check (char_length(trim(timezone)) > 0)
);

comment on table public.profiles is 'Peekd user profile. id matches auth.users.id; email comes from auth.';
comment on column public.profiles.id is 'Supabase Auth user id';
comment on column public.profiles.name is 'Display name shown in Account settings';
comment on column public.profiles.timezone is 'IANA time zone, e.g. America/New_York';
comment on column public.profiles.is_deleted is 'Soft-delete flag; email still lives in auth.users';

-- ── updated_at ──────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── Auto-create profile on signup ───────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, timezone)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      ''
    ),
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'timezone'), ''),
      'America/New_York'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.profiles enable row level security;

drop policy if exists "Profiles: select own" on public.profiles;
create policy "Profiles: select own"
  on public.profiles for select
  using (auth.uid() = id and not is_deleted);

drop policy if exists "Profiles: insert own" on public.profiles;
create policy "Profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Profiles: update own" on public.profiles;
create policy "Profiles: update own"
  on public.profiles for update
  using (auth.uid() = id and not is_deleted)
  with check (auth.uid() = id);

drop policy if exists "Profiles: delete own" on public.profiles;
create policy "Profiles: delete own"
  on public.profiles for delete
  using (auth.uid() = id);

-- ── Backfill existing auth users (optional, safe to re-run) ─────────────────

insert into public.profiles (id, name, timezone)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    ''
  ),
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'timezone'), ''),
    'America/New_York'
  )
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);
