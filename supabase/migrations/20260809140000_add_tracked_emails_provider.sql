-- Which mail provider sent a tracked email, so reply sync and inbox lookups
-- know which API to talk to. The gmail_message_id / gmail_thread_id columns are
-- reused generically: for Outlook they hold the internetMessageId and the
-- Graph conversationId respectively.
alter table public.tracked_emails
  add column if not exists provider text not null default 'gmail';

alter table public.tracked_emails
  drop constraint if exists tracked_emails_provider_check;

alter table public.tracked_emails
  add constraint tracked_emails_provider_check
  check (provider in ('gmail', 'outlook'));

create index if not exists tracked_emails_provider_idx
  on public.tracked_emails (provider);
