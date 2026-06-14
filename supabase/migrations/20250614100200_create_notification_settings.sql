-- Peekd user notification preferences (run in Supabase SQL Editor or via CLI migrate)
-- One row per user; mirrors Settings → Notifications toggles.

-- ── Table ───────────────────────────────────────────────────────────────────

create table if not exists public.notification_settings (
  id uuid primary key references auth.users (id) on delete cascade,
  email_opens_enabled boolean not null default true,
  link_clicks_enabled boolean not null default true,
  reply_read_enabled boolean not null default true,
  desktop_enabled boolean not null default true,
  sound_enabled boolean not null default false,
  mobile_push_enabled boolean not null default true,
  daily_digest_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notification_settings is 'Per-user notification preferences from Settings → Notifications.';
comment on column public.notification_settings.id is 'Supabase Auth user id';
comment on column public.notification_settings.email_opens_enabled is 'Alert when a sent email is opened';
comment on column public.notification_settings.link_clicks_enabled is 'Alert when a link in a sent email is clicked';
comment on column public.notification_settings.reply_read_enabled is 'Alert when someone reads a reply you sent';
comment on column public.notification_settings.desktop_enabled is 'Browser desktop push notifications';
comment on column public.notification_settings.sound_enabled is 'Play a sound on new alerts';
comment on column public.notification_settings.mobile_push_enabled is 'Push notifications to the mobile app';
comment on column public.notification_settings.daily_digest_enabled is 'Morning email summary of yesterday''s activity';

-- ── updated_at ──────────────────────────────────────────────────────────────

drop trigger if exists notification_settings_set_updated_at on public.notification_settings;
create trigger notification_settings_set_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();

-- ── Auto-create defaults on signup ──────────────────────────────────────────

create or replace function public.handle_new_user_notification_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_settings (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_notification_settings on auth.users;
create trigger on_auth_user_created_notification_settings
  after insert on auth.users
  for each row execute function public.handle_new_user_notification_settings();

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.notification_settings enable row level security;

drop policy if exists "Notification settings: select own" on public.notification_settings;
create policy "Notification settings: select own"
  on public.notification_settings for select
  using (auth.uid() = id);

drop policy if exists "Notification settings: insert own" on public.notification_settings;
create policy "Notification settings: insert own"
  on public.notification_settings for insert
  with check (auth.uid() = id);

drop policy if exists "Notification settings: update own" on public.notification_settings;
create policy "Notification settings: update own"
  on public.notification_settings for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Notification settings: delete own" on public.notification_settings;
create policy "Notification settings: delete own"
  on public.notification_settings for delete
  using (auth.uid() = id);

-- ── Backfill existing auth users (optional, safe to re-run) ─────────────────

insert into public.notification_settings (id)
select u.id
from auth.users u
where not exists (
  select 1 from public.notification_settings n where n.id = u.id
);
