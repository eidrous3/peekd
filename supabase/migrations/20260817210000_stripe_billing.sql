-- Stripe Billing: store customer/subscription ids. Plan stays service-role only.

alter table public.profiles
  add column if not exists stripe_customer_id text;

alter table public.profiles
  add column if not exists stripe_subscription_id text;

comment on column public.profiles.stripe_customer_id is 'Stripe customer id (cus_…) from Checkout/webhooks.';
comment on column public.profiles.stripe_subscription_id is 'Current Stripe subscription id (sub_…) for this account.';

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists profiles_stripe_subscription_id_idx
  on public.profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

create or replace function public.protect_profile_billing()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(auth.role(), '') is distinct from 'service_role' then
      new.plan := 'free';
      new.paddle_customer_id := null;
      new.paddle_subscription_id := null;
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
    end if;
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  new.plan := old.plan;
  new.paddle_customer_id := old.paddle_customer_id;
  new.paddle_subscription_id := old.paddle_subscription_id;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  return new;
end;
$$;
