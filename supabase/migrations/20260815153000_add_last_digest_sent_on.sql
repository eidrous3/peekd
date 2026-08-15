-- Idempotency for the daily digest cron: the local calendar date (YYYY-MM-DD
-- in the user's timezone) of the last successful send. The hourly job sends
-- at 08:00 local and skips anyone already stamped with today's date.

alter table public.notification_settings
  add column if not exists last_digest_sent_on date;

comment on column public.notification_settings.last_digest_sent_on is
  'Local calendar date of the last daily digest email, used so the hourly cron cannot double-send.';
