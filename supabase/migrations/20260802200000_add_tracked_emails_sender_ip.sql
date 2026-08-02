-- Capture the sender's IP at send time so opens/clicks from the same IP
-- (e.g. the sender viewing their own Sent copy) can be classified as 'self'
-- and excluded from open/click counts.
alter table public.tracked_emails
  add column if not exists sender_ip text;
