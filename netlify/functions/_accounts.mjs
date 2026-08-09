import { dbRequest } from './_support.mjs';

export const PROVIDERS = ['gmail', 'outlook'];

const ACCOUNT_COLUMNS = 'id,provider,email,is_primary,refresh_token,access_token,token_expires_at';

function normalizeProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  return PROVIDERS.includes(value) ? value : '';
}

/**
 * Connected mail accounts for a user, newest-primary first.
 * Omit `provider` to search across every provider.
 */
export async function getConnectedAccounts(userId, { email, accountId, provider } = {}) {
  if (!userId) return [];

  let q = `connected_accounts?user_id=eq.${encodeURIComponent(userId)}&select=${ACCOUNT_COLUMNS}`;
  const scoped = normalizeProvider(provider);
  if (scoped) q += `&provider=eq.${scoped}`;
  if (accountId) q += `&id=eq.${encodeURIComponent(accountId)}`;
  else if (email) q += `&email=eq.${encodeURIComponent(email)}`;
  q += '&order=is_primary.desc,created_at.asc';

  const res = await dbRequest(q);
  return res.ok && Array.isArray(res.data) ? res.data : [];
}

export async function patchAccountTokens(accountId, tokens) {
  if (!accountId) return;

  const expiresAt = tokens?.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
    : null;

  await dbRequest(`connected_accounts?id=eq.${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    body: {
      access_token: tokens?.access_token || null,
      token_expires_at: expiresAt,
      ...(tokens?.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    },
    prefer: 'return=minimal',
  });
}

/**
 * Upsert an OAuth account. The first account a user connects — across all
 * providers — becomes their primary sending address.
 */
export async function saveConnectedAccount({ userId, email, tokens, provider, scopes }) {
  const kind = normalizeProvider(provider);
  const address = String(email || '').trim().toLowerCase();
  if (!userId || !address || !kind) return { ok: false, error: 'invalid_account' };

  const expiresAt = tokens?.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
    : null;

  const tokenPatch = {
    refresh_token: tokens?.refresh_token || null,
    access_token: tokens?.access_token || null,
    token_expires_at: expiresAt,
    scopes: scopes || null,
  };

  const existingRes = await dbRequest(
    `connected_accounts?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${kind}&email=eq.${encodeURIComponent(address)}&select=id`,
  );
  const existing = existingRes.ok && Array.isArray(existingRes.data) ? existingRes.data : [];

  if (existing.length > 0) {
    // Re-connecting: Microsoft omits refresh_token on some consent replays, so keep the stored one.
    const patch = { ...tokenPatch };
    if (!patch.refresh_token) delete patch.refresh_token;

    const res = await dbRequest(`connected_accounts?id=eq.${encodeURIComponent(existing[0].id)}`, {
      method: 'PATCH',
      body: patch,
      prefer: 'return=minimal',
    });
    if (!res.ok) return { ok: false, error: res.error || 'update_failed' };
    return { ok: true, accountId: existing[0].id };
  }

  const allRes = await dbRequest(
    `connected_accounts?user_id=eq.${encodeURIComponent(userId)}&select=id`,
  );
  const all = allRes.ok && Array.isArray(allRes.data) ? allRes.data : [];

  const insert = await dbRequest('connected_accounts', {
    method: 'POST',
    body: {
      user_id: userId,
      provider: kind,
      email: address,
      is_primary: all.length === 0,
      ...tokenPatch,
    },
    prefer: 'return=representation',
  });

  if (!insert.ok) return { ok: false, error: insert.error || 'save_failed' };
  return { ok: true, accountId: insert.data?.[0]?.id || null };
}
