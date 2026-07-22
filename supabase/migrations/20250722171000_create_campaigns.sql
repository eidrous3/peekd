-- Peekd campaigns: sequence + frozen recipient snapshot

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  status text not null default 'active'
    check (status in ('draft', 'active', 'paused', 'completed')),
  from_email text not null default '',
  source_list_id uuid references public.lists (id) on delete set null,
  timezone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_name_not_empty check (char_length(trim(name)) > 0),
  constraint campaigns_timezone_not_empty check (char_length(trim(timezone)) > 0)
);

comment on table public.campaigns is 'Outbound email sequences owned by a Peekd user.';
comment on column public.campaigns.source_list_id is 'Optional list used at launch (audience is snapshotted into campaign_recipients).';
comment on column public.campaigns.timezone is 'IANA timezone from the client at create time (e.g. America/New_York).';

create index if not exists campaigns_user_id_idx on public.campaigns (user_id);
create index if not exists campaigns_source_list_id_idx on public.campaigns (source_list_id);
create index if not exists campaigns_status_idx on public.campaigns (status);

drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

create table if not exists public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  position integer not null,
  subject text not null default '',
  body_html text not null default '',
  delay_days integer not null default 0
    check (delay_days >= 0),
  scheduled_at timestamptz,
  sent_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'sent', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_steps_position_positive check (position >= 1),
  constraint campaign_steps_campaign_position_key unique (campaign_id, position)
);

comment on table public.campaign_steps is 'Ordered steps in a campaign sequence.';
comment on column public.campaign_steps.delay_days is 'Days to wait after prior step send (0 = immediate / at launch for step 1).';
comment on column public.campaign_steps.scheduled_at is 'Absolute send time (timestamptz); set at launch for step 1, later when prior step sends.';

create index if not exists campaign_steps_campaign_id_idx on public.campaign_steps (campaign_id);
create index if not exists campaign_steps_scheduled_at_idx on public.campaign_steps (scheduled_at);

drop trigger if exists campaign_steps_set_updated_at on public.campaign_steps;
create trigger campaign_steps_set_updated_at
  before update on public.campaign_steps
  for each row execute function public.set_updated_at();

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  email text not null,
  person_id uuid references public.people (id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'replied', 'completed')),
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_recipients_email_not_empty check (char_length(trim(email)) > 0),
  constraint campaign_recipients_campaign_email_key unique (campaign_id, email)
);

comment on table public.campaign_recipients is 'Frozen audience snapshot for a campaign (not live list membership).';

create index if not exists campaign_recipients_campaign_id_idx on public.campaign_recipients (campaign_id);
create index if not exists campaign_recipients_email_idx on public.campaign_recipients (email);
create index if not exists campaign_recipients_person_id_idx on public.campaign_recipients (person_id);

drop trigger if exists campaign_recipients_set_updated_at on public.campaign_recipients;
create trigger campaign_recipients_set_updated_at
  before update on public.campaign_recipients
  for each row execute function public.set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.campaigns enable row level security;
alter table public.campaign_steps enable row level security;
alter table public.campaign_recipients enable row level security;

drop policy if exists "Campaigns: select own" on public.campaigns;
create policy "Campaigns: select own"
  on public.campaigns for select
  using (auth.uid() = user_id);

drop policy if exists "Campaigns: insert own" on public.campaigns;
create policy "Campaigns: insert own"
  on public.campaigns for insert
  with check (
    auth.uid() = user_id
    and (
      source_list_id is null
      or exists (
        select 1 from public.lists l
        where l.id = source_list_id and l.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Campaigns: update own" on public.campaigns;
create policy "Campaigns: update own"
  on public.campaigns for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      source_list_id is null
      or exists (
        select 1 from public.lists l
        where l.id = source_list_id and l.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Campaigns: delete own" on public.campaigns;
create policy "Campaigns: delete own"
  on public.campaigns for delete
  using (auth.uid() = user_id);

drop policy if exists "Campaign steps: select own" on public.campaign_steps;
create policy "Campaign steps: select own"
  on public.campaign_steps for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Campaign steps: insert own" on public.campaign_steps;
create policy "Campaign steps: insert own"
  on public.campaign_steps for insert
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Campaign steps: update own" on public.campaign_steps;
create policy "Campaign steps: update own"
  on public.campaign_steps for update
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Campaign steps: delete own" on public.campaign_steps;
create policy "Campaign steps: delete own"
  on public.campaign_steps for delete
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Campaign recipients: select own" on public.campaign_recipients;
create policy "Campaign recipients: select own"
  on public.campaign_recipients for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Campaign recipients: insert own" on public.campaign_recipients;
create policy "Campaign recipients: insert own"
  on public.campaign_recipients for insert
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Campaign recipients: update own" on public.campaign_recipients;
create policy "Campaign recipients: update own"
  on public.campaign_recipients for update
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Campaign recipients: delete own" on public.campaign_recipients;
create policy "Campaign recipients: delete own"
  on public.campaign_recipients for delete
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.user_id = auth.uid()
    )
  );
