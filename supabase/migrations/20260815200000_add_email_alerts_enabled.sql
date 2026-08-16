-- Instant notification emails (opens / clicks / replies), separate from the
-- morning daily digest.

alter table public.notification_settings
  add column if not exists email_alerts_enabled boolean not null default false;

comment on column public.notification_settings.email_alerts_enabled is
  'Email the user when a tracking alert fires. Independent of daily_digest_enabled.';
