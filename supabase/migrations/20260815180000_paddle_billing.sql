-- Paddle Billing: store customer/subscription ids and stop clients from
-- granting themselves premium. Plan changes go through the webhook only.

alter table public.profiles
  add column if not exists paddle_customer_id text;

alter table public.profiles
  add column if not exists paddle_subscription_id text;

comment on column public.profiles.paddle_customer_id is 'Paddle customer id (ctm_…) from checkout/webhooks.';
comment on column public.profiles.paddle_subscription_id is 'Current Paddle subscription id (sub_…) for this account.';

create index if not exists profiles_paddle_customer_id_idx
  on public.profiles (paddle_customer_id)
  where paddle_customer_id is not null;

create index if not exists profiles_paddle_subscription_id_idx
  on public.profiles (paddle_subscription_id)
  where paddle_subscription_id is not null;

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
    end if;
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  new.plan := old.plan;
  new.paddle_customer_id := old.paddle_customer_id;
  new.paddle_subscription_id := old.paddle_subscription_id;
  return new;
end;
$$;

drop trigger if exists profiles_protect_billing on public.profiles;
create trigger profiles_protect_billing
  before insert or update on public.profiles
  for each row execute function public.protect_profile_billing();
