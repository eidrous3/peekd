-- Digest cadence: daily (default) or weekly (Monday 8am local).
-- daily_digest_enabled remains the on/off switch.

alter table public.notification_settings
  add column if not exists digest_frequency text not null default 'daily';

alter table public.notification_settings
  drop constraint if exists notification_settings_digest_frequency_valid;

alter table public.notification_settings
  add constraint notification_settings_digest_frequency_valid
  check (digest_frequency in ('daily', 'weekly'));

comment on column public.notification_settings.digest_frequency is
  'How often to email the digest when daily_digest_enabled is true: daily or weekly (Monday).';
