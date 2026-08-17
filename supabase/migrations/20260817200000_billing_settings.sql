-- Singleton flags for which payment methods end users may use.

create table if not exists public.billing_settings (
  id integer primary key default 1 check (id = 1),
  coupons_enabled boolean not null default true,
  paddle_enabled boolean not null default true,
  stripe_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.billing_settings is 'Which checkout methods Peekd shows to end users.';

insert into public.billing_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.billing_settings enable row level security;
