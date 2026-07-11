-- Store resolved city/region for link click events (Pro location from clicks).

alter table public.email_click_events
  add column if not exists location_label text;

comment on column public.email_click_events.location_label is 'City/region resolved from IP at click time, when available.';
