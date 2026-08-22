-- Mailbox OAuth tokens must stay server-only. RLS only hides other users'
-- rows; without column grants the logged-in browser can still select
-- refresh_token and access_token on its own connected_accounts rows.
--
-- Clients still need SELECT on public fields (Integrations list) and DELETE
-- (disconnect). Token writes stay on the service role (OAuth callbacks).
-- set_primary_connected_account is SECURITY DEFINER, so it can still flip
-- is_primary without a client UPDATE grant.

revoke all on table public.connected_accounts from anon, authenticated;

grant select (
  id,
  user_id,
  provider,
  email,
  is_primary,
  created_at,
  updated_at
) on table public.connected_accounts to authenticated;

grant delete on table public.connected_accounts to authenticated;
