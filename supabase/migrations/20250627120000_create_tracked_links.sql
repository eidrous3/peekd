-- Peekd link click tracking (redirect URLs at getpeekd.com/t/TOKEN)

create table if not exists public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  tracked_email_id uuid not null references public.tracked_emails (id) on delete cascade,
  original_url text not null,
  click_token text not null,
  created_at timestamptz not null default now(),
  constraint tracked_links_original_url_not_empty check (char_length(trim(original_url)) > 0),
  constraint tracked_links_click_token_not_empty check (char_length(trim(click_token)) > 0),
  constraint tracked_links_click_token_key unique (click_token),
  constraint tracked_links_email_url_key unique (tracked_email_id, original_url)
);

create table if not exists public.email_click_events (
  id uuid primary key default gen_random_uuid(),
  tracked_link_id uuid not null references public.tracked_links (id) on delete cascade,
  clicked_at timestamptz not null default now(),
  user_agent text,
  ip text,
  classification text not null default 'unknown'
    check (classification in ('human', 'likely_proxy', 'unknown')),
  created_at timestamptz not null default now()
);

comment on table public.tracked_links is 'Trackable redirect link for a sent email (one token per unique URL per send).';
comment on table public.email_click_events is 'Click events recorded before redirect to original_url.';
comment on column public.tracked_links.click_token is 'Opaque token in getpeekd.com/t/{token} redirect URLs.';

create index if not exists tracked_links_tracked_email_id_idx on public.tracked_links (tracked_email_id);
create index if not exists tracked_links_click_token_idx on public.tracked_links (click_token);

create index if not exists email_click_events_tracked_link_id_idx on public.email_click_events (tracked_link_id);
create index if not exists email_click_events_clicked_at_idx on public.email_click_events (clicked_at desc);

alter table public.tracked_links enable row level security;
alter table public.email_click_events enable row level security;

drop policy if exists "Tracked links: select own sends" on public.tracked_links;
create policy "Tracked links: select own sends"
  on public.tracked_links for select
  using (
    exists (
      select 1 from public.tracked_emails t
      where t.id = tracked_email_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "Email click events: select own sends" on public.email_click_events;
create policy "Email click events: select own sends"
  on public.email_click_events for select
  using (
    exists (
      select 1
      from public.tracked_links l
      join public.tracked_emails t on t.id = l.tracked_email_id
      where l.id = tracked_link_id and t.user_id = auth.uid()
    )
  );
