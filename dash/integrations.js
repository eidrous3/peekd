(function () {
  const PUBLIC_COLUMNS = 'id, user_id, provider, email, is_primary, created_at, updated_at';

  async function session() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return null;
    return Auth.ensureSession();
  }

  async function fetchGmailAccounts() {
    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { data, error } = await sb
      .from('connected_accounts')
      .select(PUBLIC_COLUMNS)
      .eq('user_id', s.user.id)
      .eq('provider', 'gmail')
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) return { ok: false, error: error.message };

    return { ok: true, accounts: data || [] };
  }

  async function startGmailConnect() {
    const s = await session();
    if (!s?.access_token) return { ok: false, error: 'no_session' };

    const res = await fetch('/.netlify/functions/gmail-connect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      return { ok: false, error: data.error || data.reason || 'connect_failed' };
    }

    window.location.href = data.url;
    return { ok: true };
  }

  async function disconnectAccount(accountId) {
    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { error } = await sb
      .from('connected_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', s.user.id);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function setPrimaryAccount(accountId) {
    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { error } = await sb.rpc('set_primary_connected_account', { account_id: accountId });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  window.PeekdIntegrations = {
    fetchGmailAccounts,
    startGmailConnect,
    disconnectAccount,
    setPrimaryAccount,
  };
})();
