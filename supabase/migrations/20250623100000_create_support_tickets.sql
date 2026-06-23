-- Peekd support tickets (Help → Contact Support)

create sequence if not exists support_ticket_number_seq start 1000;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint not null default nextval('support_ticket_number_seq'),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_email text not null,
  subject text not null,
  category text not null default 'Other',
  status text not null default 'open' check (status in ('open', 'progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_subject_not_empty check (char_length(trim(subject)) > 0)
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  sender text not null check (sender in ('user', 'admin')),
  sender_name text not null default '',
  body text not null default '',
  attachment_path text,
  attachment_filename text,
  attachment_mime text,
  created_at timestamptz not null default now()
);

comment on table public.support_tickets is 'User-submitted support tickets.';
comment on table public.support_messages is 'Thread messages on a support ticket.';

create index if not exists support_tickets_user_id_idx on public.support_tickets (user_id);
create index if not exists support_tickets_status_idx on public.support_tickets (status);
create index if not exists support_messages_ticket_id_idx on public.support_messages (ticket_id);

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "Support tickets: select own" on public.support_tickets;
create policy "Support tickets: select own"
  on public.support_tickets for select
  using (auth.uid() = user_id);

drop policy if exists "Support tickets: insert own" on public.support_tickets;
create policy "Support tickets: insert own"
  on public.support_tickets for insert
  with check (auth.uid() = user_id);

drop policy if exists "Support messages: select own tickets" on public.support_messages;
create policy "Support messages: select own tickets"
  on public.support_messages for select
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "Support messages: insert own tickets" on public.support_messages;
create policy "Support messages: insert own tickets"
  on public.support_messages for insert
  with check (
    sender = 'user'
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
  );

-- Admin reads/writes happen via service role in Netlify functions.

-- ── Storage bucket for attachments ──────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-attachments',
  'ticket-attachments',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/jpg', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
