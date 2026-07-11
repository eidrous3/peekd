-- Store resolved city/region for open events (Pro location engagement).

alter table public.email_open_events
  add column if not exists location_label text;

comment on column public.email_open_events.location_label is 'City/region resolved from IP at open time, when available.';
