-- classifyOpen / classifyClick return 'self' for same-IP sender traffic.
-- The original check constraints omitted it, so those inserts failed silently
-- and no click (or open) event — or alert — was recorded.
alter table public.email_click_events
  drop constraint if exists email_click_events_classification_check;

alter table public.email_click_events
  add constraint email_click_events_classification_check
  check (classification in ('human', 'likely_proxy', 'unknown', 'self'));

alter table public.email_open_events
  drop constraint if exists email_open_events_classification_check;

alter table public.email_open_events
  add constraint email_open_events_classification_check
  check (classification in ('human', 'likely_proxy', 'unknown', 'self'));
