(function () {
  const PUBLIC_COLUMNS = 'id, user_id, provider, email, is_primary, created_at, updated_at';

  async function session() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return null;
    return Auth.ensureSession();
  }

  /** Connected accounts, optionally scoped to one provider. */
  async function fetchAccounts(provider) {
    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    let q = sb
      .from('connected_accounts')
      .select(PUBLIC_COLUMNS)
      .eq('user_id', s.user.id);
    if (provider) q = q.eq('provider', provider);

    const { data, error } = await q
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) return { ok: false, error: error.message };

    return { ok: true, accounts: data || [] };
  }

  function fetchGmailAccounts() {
    return fetchAccounts('gmail');
  }

  function fetchOutlookAccounts() {
    return fetchAccounts('outlook');
  }

  /** Every address the user can send from, across providers. */
  function fetchSendingAccounts() {
    return fetchAccounts(null);
  }

  async function startConnect(provider) {
    const s = await session();
    if (!s?.access_token) return { ok: false, error: 'no_session' };

    const fn = provider === 'outlook' ? 'outlook-connect' : 'gmail-connect';
    const res = await fetch(`/.netlify/functions/${fn}`, {
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

  function startGmailConnect() {
    return startConnect('gmail');
  }

  function startOutlookConnect() {
    return startConnect('outlook');
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
    fetchAccounts,
    fetchGmailAccounts,
    fetchOutlookAccounts,
    fetchSendingAccounts,
    startConnect,
    startGmailConnect,
    startOutlookConnect,
    disconnectAccount,
    setPrimaryAccount,
  };
})();
