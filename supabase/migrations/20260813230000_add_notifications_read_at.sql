-- Read watermark for the notification drawer.
-- The drawer derives its rows from open/reply tracking data, so there is no
-- notification table to mark; anything newer than this timestamp is unread.

alter table public.notification_settings
  add column if not exists notifications_read_at timestamptz;

comment on column public.notification_settings.notifications_read_at is 'Notifications at or before this time are considered read.';
