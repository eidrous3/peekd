-- Peekd connected email accounts (Gmail OAuth tokens stored server-side)

create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail', 'outlook')),
  email text not null,
  is_primary boolean not null default false,
  refresh_token text,
  access_token text,
  token_expires_at timestamptz,
  scopes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connected_accounts_email_not_empty check (char_length(trim(email)) > 0),
  constraint connected_accounts_user_provider_email_key unique (user_id, provider, email)
);

comment on table public.connected_accounts is 'OAuth-connected email accounts per user.';
comment on column public.connected_accounts.refresh_token is 'Google refresh token — never expose to client SELECT lists';

drop trigger if exists connected_accounts_set_updated_at on public.connected_accounts;
create trigger connected_accounts_set_updated_at
  before update on public.connected_accounts
  for each row execute function public.set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.connected_accounts enable row level security;

drop policy if exists "Connected accounts: select own" on public.connected_accounts;
create policy "Connected accounts: select own"
  on public.connected_accounts for select
  using (auth.uid() = user_id);

drop policy if exists "Connected accounts: delete own" on public.connected_accounts;
create policy "Connected accounts: delete own"
  on public.connected_accounts for delete
  using (auth.uid() = user_id);

drop policy if exists "Connected accounts: update own" on public.connected_accounts;
create policy "Connected accounts: update own"
  on public.connected_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Inserts happen via service role in the Gmail OAuth callback.

create or replace function public.set_primary_connected_account(account_id uuid)
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

  if not exists (
    select 1 from public.connected_accounts
    where id = account_id and user_id = uid
  ) then
    raise exception 'account not found';
  end if;

  update public.connected_accounts
  set is_primary = false
  where user_id = uid;

  update public.connected_accounts
  set is_primary = true
  where id = account_id and user_id = uid;
end;
$$;

revoke all on function public.set_primary_connected_account(uuid) from public;
grant execute on function public.set_primary_connected_account(uuid) to authenticated;
