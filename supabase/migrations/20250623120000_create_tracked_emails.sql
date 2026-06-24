-- Peekd open tracking for composed Gmail sends (tracking pixel + open events)

create table if not exists public.tracked_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  from_email text not null,
  subject text not null,
  gmail_message_id text,
  gmail_thread_id text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracked_emails_from_email_not_empty check (char_length(trim(from_email)) > 0),
  constraint tracked_emails_subject_not_empty check (char_length(trim(subject)) > 0)
);

create table if not exists public.tracked_recipients (
  id uuid primary key default gen_random_uuid(),
  tracked_email_id uuid not null references public.tracked_emails (id) on delete cascade,
  email text not null,
  pixel_token text not null,
  created_at timestamptz not null default now(),
  constraint tracked_recipients_email_not_empty check (char_length(trim(email)) > 0),
  constraint tracked_recipients_pixel_token_not_empty check (char_length(trim(pixel_token)) > 0),
  constraint tracked_recipients_pixel_token_key unique (pixel_token),
  constraint tracked_recipients_email_per_send_key unique (tracked_email_id, email)
);

create table if not exists public.email_open_events (
  id uuid primary key default gen_random_uuid(),
  tracked_recipient_id uuid not null references public.tracked_recipients (id) on delete cascade,
  opened_at timestamptz not null default now(),
  user_agent text,
  ip text,
  classification text not null default 'unknown'
    check (classification in ('human', 'likely_proxy', 'unknown')),
  created_at timestamptz not null default now()
);

comment on table public.tracked_emails is 'Peekd-tracked outbound email (one row per compose send).';
comment on table public.tracked_recipients is 'Per-recipient pixel token for a tracked send.';
comment on table public.email_open_events is 'Pixel load events for open tracking and analytics.';
comment on column public.tracked_recipients.pixel_token is 'Opaque token embedded in the tracking pixel URL.';
comment on column public.email_open_events.classification is 'human, likely_proxy (Apple/Gmail prefetch), or unknown.';

create index if not exists tracked_emails_user_id_idx on public.tracked_emails (user_id);
create index if not exists tracked_emails_sent_at_idx on public.tracked_emails (sent_at desc);
create index if not exists tracked_emails_gmail_message_id_idx on public.tracked_emails (gmail_message_id)
  where gmail_message_id is not null;

create index if not exists tracked_recipients_tracked_email_id_idx on public.tracked_recipients (tracked_email_id);
create index if not exists tracked_recipients_email_idx on public.tracked_recipients (email);

create index if not exists email_open_events_tracked_recipient_id_idx on public.email_open_events (tracked_recipient_id);
create index if not exists email_open_events_opened_at_idx on public.email_open_events (opened_at desc);

drop trigger if exists tracked_emails_set_updated_at on public.tracked_emails;
create trigger tracked_emails_set_updated_at
  before update on public.tracked_emails
  for each row execute function public.set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Inserts/updates from Netlify functions use the service role.

alter table public.tracked_emails enable row level security;
alter table public.tracked_recipients enable row level security;
alter table public.email_open_events enable row level security;

drop policy if exists "Tracked emails: select own" on public.tracked_emails;
create policy "Tracked emails: select own"
  on public.tracked_emails for select
  using (auth.uid() = user_id);

drop policy if exists "Tracked recipients: select own sends" on public.tracked_recipients;
create policy "Tracked recipients: select own sends"
  on public.tracked_recipients for select
  using (
    exists (
      select 1 from public.tracked_emails t
      where t.id = tracked_email_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "Email open events: select own sends" on public.email_open_events;
create policy "Email open events: select own sends"
  on public.email_open_events for select
  using (
    exists (
      select 1
      from public.tracked_recipients r
      join public.tracked_emails t on t.id = r.tracked_email_id
      where r.id = tracked_recipient_id and t.user_id = auth.uid()
    )
  );
