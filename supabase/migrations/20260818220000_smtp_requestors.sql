-- Waitlist for Custom Email (IMAP/SMTP). One row per Peekd user.

create table if not exists public.smtp_requestors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null default '',
  created_at timestamptz not null default now(),
  constraint smtp_requestors_user_id_key unique (user_id)
);

comment on table public.smtp_requestors is 'Users who asked to be notified when IMAP/SMTP is ready.';
comment on column public.smtp_requestors.user_id is 'Peekd account that clicked Notify me.';
comment on column public.smtp_requestors.email is 'Email at the time they requested SMTP.';

create index if not exists smtp_requestors_created_at_idx
  on public.smtp_requestors (created_at desc);

alter table public.smtp_requestors enable row level security;
