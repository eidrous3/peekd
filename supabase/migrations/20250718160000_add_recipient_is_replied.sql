-- Persist Gmail reply detection on tracked recipients for analytics.

alter table public.tracked_recipients
  add column if not exists is_replied boolean not null default false;

alter table public.tracked_recipients
  add column if not exists replied_at timestamptz;

comment on column public.tracked_recipients.is_replied is 'True once a recipient reply was detected in the Gmail thread.';
comment on column public.tracked_recipients.replied_at is 'When the recipient reply was first detected.';

create index if not exists tracked_recipients_is_replied_idx
  on public.tracked_recipients (is_replied)
  where is_replied = true;
