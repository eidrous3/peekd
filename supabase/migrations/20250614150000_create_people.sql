-- Peekd contacts (People → All People)

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null,
  company text,
  list_id uuid references public.lists (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_email_not_empty check (char_length(trim(email)) > 0),
  constraint people_user_email_key unique (user_id, email)
);

comment on table public.people is 'Contacts saved per Peekd user.';
comment on column public.people.list_id is 'Optional saved list membership';

create index if not exists people_user_id_idx on public.people (user_id);
create index if not exists people_list_id_idx on public.people (list_id);

drop trigger if exists people_set_updated_at on public.people;
create trigger people_set_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.people enable row level security;

drop policy if exists "People: select own" on public.people;
create policy "People: select own"
  on public.people for select
  using (auth.uid() = user_id);

drop policy if exists "People: insert own" on public.people;
create policy "People: insert own"
  on public.people for insert
  with check (
    auth.uid() = user_id
    and (
      list_id is null
      or exists (
        select 1 from public.lists l
        where l.id = list_id and l.user_id = auth.uid()
      )
    )
  );

drop policy if exists "People: update own" on public.people;
create policy "People: update own"
  on public.people for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      list_id is null
      or exists (
        select 1 from public.lists l
        where l.id = list_id and l.user_id = auth.uid()
      )
    )
  );

drop policy if exists "People: delete own" on public.people;
create policy "People: delete own"
  on public.people for delete
  using (auth.uid() = user_id);
