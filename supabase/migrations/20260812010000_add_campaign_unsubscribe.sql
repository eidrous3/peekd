-- Opt-in unsubscribe link per campaign, plus the recipient state it produces.

alter table public.campaigns
  add column if not exists include_unsubscribe_link boolean not null default false;

comment on column public.campaigns.include_unsubscribe_link is
  'When true, every send in this campaign gets a signed per-recipient unsubscribe link.';

alter table public.campaign_recipients
  add column if not exists unsubscribed_at timestamptz;

comment on column public.campaign_recipients.unsubscribed_at is
  'Set when the recipient used the unsubscribe link; they are skipped by later steps.';

-- Widen the status check to allow the new terminal state. The original constraint
-- was declared inline, so Postgres named it <table>_<column>_check.
alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_status_check;

alter table public.campaign_recipients
  add constraint campaign_recipients_status_check
  check (status in ('active', 'paused', 'replied', 'completed', 'unsubscribed'));

create index if not exists campaign_recipients_status_idx
  on public.campaign_recipients (status);
