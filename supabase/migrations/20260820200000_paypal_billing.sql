-- PayPal Billing: store payer/subscription ids and expose an admin checkout toggle.

alter table public.billing_settings
  add column if not exists paypal_enabled boolean not null default false;

comment on column public.billing_settings.paypal_enabled is 'Show PayPal checkout on the Upgrade screen.';

alter table public.profiles
  add column if not exists paypal_customer_id text;

alter table public.profiles
  add column if not exists paypal_subscription_id text;

comment on column public.profiles.paypal_customer_id is 'PayPal payer id from subscription webhooks.';
comment on column public.profiles.paypal_subscription_id is 'Current PayPal subscription id (I-…) for this account.';

create index if not exists profiles_paypal_customer_id_idx
  on public.profiles (paypal_customer_id)
  where paypal_customer_id is not null;

create index if not exists profiles_paypal_subscription_id_idx
  on public.profiles (paypal_subscription_id)
  where paypal_subscription_id is not null;

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
      new.paypal_customer_id := null;
      new.paypal_subscription_id := null;
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
  new.paypal_customer_id := old.paypal_customer_id;
  new.paypal_subscription_id := old.paypal_subscription_id;
  return new;
end;
$$;
