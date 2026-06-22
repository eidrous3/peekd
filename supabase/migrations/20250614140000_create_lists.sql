-- Peekd contact lists (People → Lists)

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint lists_name_not_empty check (char_length(trim(name)) > 0),
  constraint lists_user_name_key unique (user_id, name)
);

comment on table public.lists is 'Saved contact lists per user.';
comment on column public.lists.name is 'Display name shown in People → Lists';

create index if not exists lists_user_id_idx on public.lists (user_id);

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.lists enable row level security;

drop policy if exists "Lists: select own" on public.lists;
create policy "Lists: select own"
  on public.lists for select
  using (auth.uid() = user_id);

drop policy if exists "Lists: insert own" on public.lists;
create policy "Lists: insert own"
  on public.lists for insert
  with check (auth.uid() = user_id);

drop policy if exists "Lists: update own" on public.lists;
create policy "Lists: update own"
  on public.lists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Lists: delete own" on public.lists;
create policy "Lists: delete own"
  on public.lists for delete
  using (auth.uid() = user_id);
