-- Per-notification read state for the notification drawer.
-- The feed is derived from tracking data, so rows are keyed by a stable string
-- ("open:<event id>" / "reply:<recipient id>") rather than a foreign key.
-- Marking everything read bumps notification_settings.notifications_read_at and
-- clears these rows, so the table only holds reads newer than that watermark.

create table if not exists public.notification_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

comment on table public.notification_reads is 'Notifications a user has opened individually.';

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.notification_reads enable row level security;

drop policy if exists "Notification reads: select own" on public.notification_reads;
create policy "Notification reads: select own"
  on public.notification_reads for select
  using (auth.uid() = user_id);

drop policy if exists "Notification reads: insert own" on public.notification_reads;
create policy "Notification reads: insert own"
  on public.notification_reads for insert
  with check (auth.uid() = user_id);

drop policy if exists "Notification reads: update own" on public.notification_reads;
create policy "Notification reads: update own"
  on public.notification_reads for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Notification reads: delete own" on public.notification_reads;
create policy "Notification reads: delete own"
  on public.notification_reads for delete
  using (auth.uid() = user_id);
