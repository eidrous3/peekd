-- Subscription tier for a Peekd account, replacing the client-only localStorage flag.
-- There is no billing provider yet, so the existing "Profiles: update own" policy
-- lets a user set their own plan — which is what the demo upgrade button does.
-- Once payments exist this column must become service-role only, otherwise anyone
-- can grant themselves premium with a single PostgREST call.

alter table public.profiles
  add column if not exists plan text not null default 'free';

comment on column public.profiles.plan is 'Subscription tier: free or premium.';

alter table public.profiles
  drop constraint if exists profiles_plan_valid;
alter table public.profiles
  add constraint profiles_plan_valid check (plan in ('free', 'premium'));
