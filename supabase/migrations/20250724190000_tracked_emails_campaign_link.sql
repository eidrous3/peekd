-- Link tracked sends to campaign steps so open rates can exclude unsent/future steps.

alter table public.tracked_emails
  add column if not exists campaign_id uuid references public.campaigns (id) on delete set null;

alter table public.tracked_emails
  add column if not exists campaign_step_id uuid references public.campaign_steps (id) on delete set null;

comment on column public.tracked_emails.campaign_id is 'Optional campaign this tracked send belongs to.';
comment on column public.tracked_emails.campaign_step_id is 'Optional campaign step that produced this tracked send.';

create index if not exists tracked_emails_campaign_id_idx
  on public.tracked_emails (campaign_id)
  where campaign_id is not null;

create index if not exists tracked_emails_campaign_step_id_idx
  on public.tracked_emails (campaign_step_id)
  where campaign_step_id is not null;
