-- Peekd list membership (People ↔ Lists, many-to-many)

create table if not exists public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, person_id)
);

comment on table public.list_members is 'Membership of people in saved lists; a person may belong to many lists.';

create index if not exists list_members_person_id_idx on public.list_members (person_id);
create index if not exists list_members_user_id_idx on public.list_members (user_id);

insert into public.list_members (list_id, person_id, user_id)
select p.list_id, p.id, p.user_id
from public.people p
where p.list_id is not null
on conflict do nothing;

-- Left in place so this migration can be applied before the client ships, but the
-- app no longer reads or writes it. Safe to drop in a follow-up migration.
comment on column public.people.list_id is 'Deprecated: superseded by public.list_members.';

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.list_members enable row level security;

drop policy if exists "List members: select own" on public.list_members;
create policy "List members: select own"
  on public.list_members for select
  using (auth.uid() = user_id);

drop policy if exists "List members: insert own" on public.list_members;
create policy "List members: insert own"
  on public.list_members for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
    and exists (
      select 1 from public.people p
      where p.id = person_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "List members: delete own" on public.list_members;
create policy "List members: delete own"
  on public.list_members for delete
  using (auth.uid() = user_id);
