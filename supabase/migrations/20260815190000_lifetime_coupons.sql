-- Lifetime coupons: one unused code grants plan = lifetime. Service role
-- redeems them; clients cannot read or write this table.

alter table public.profiles
  drop constraint if exists profiles_plan_valid;

alter table public.profiles
  add constraint profiles_plan_valid check (plan in ('free', 'premium', 'lifetime'));

comment on column public.profiles.plan is 'Subscription tier: free, premium (Paddle), or lifetime (coupon, never billed).';

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null,
  constraint coupons_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{4,31}$')
);

create unique index if not exists coupons_code_unique on public.coupons (code);

comment on table public.coupons is 'One-time codes that grant lifetime Peekd Pro.';
comment on column public.coupons.code is 'Normalized uppercase code. Insert with: insert into public.coupons (code) values (''FRIENDS-XXXX'');';

alter table public.coupons enable row level security;
