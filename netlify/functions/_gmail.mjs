const GMAIL_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

export function googleClientId() {
  return process.env.GOOGLE_CLIENT_ID || '';
}

export function googleClientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET || '';
}

export function supabaseUrl() {
  return (process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

export function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || '';
}

export function publicKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || serviceKey();
}

export function siteOrigin(req) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (!host) return '';
  return `${proto}://${host}`;
}

export function gmailRedirectUri(req) {
  const origin = siteOrigin(req);
  return origin ? `${origin}/.netlify/functions/gmail-callback` : '';
}

export function dashboardUrl(req, params = {}) {
  const origin = siteOrigin(req);
  const url = new URL('Peekd Dashboard.html', origin || 'https://localhost/');
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });
  return url.toString();
}

export function encodeState(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeState(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!parsed?.uid || !parsed?.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function makeState(userId) {
  return encodeState({
    uid: userId,
    exp: Date.now() + 10 * 60 * 1000,
    n: Math.random().toString(36).slice(2),
  });
}

export async function getUserFromToken(accessToken) {
  const url = supabaseUrl();
  const key = publicKey();
  if (!url || !key || !accessToken) return null;

  const res = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) return null;
  return res.json();
}

export async function exchangeCodeForTokens(code, redirectUri) {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) return { ok: false, error: 'missing_google_config' };

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || 'token_exchange_failed', detail: data };
  return { ok: true, tokens: data };
}

export async function fetchGoogleEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return (data.email || '').trim().toLowerCase() || null;
}

export async function saveConnectedAccount({ userId, email, tokens }) {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key) return { ok: false, error: 'missing_config' };

  const listRes = await fetch(
    `${url}/rest/v1/connected_accounts?user_id=eq.${encodeURIComponent(userId)}&provider=eq.gmail&select=id,is_primary`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const allAccounts = listRes.ok ? await listRes.json().catch(() => []) : [];

  const existingRes = await fetch(
    `${url}/rest/v1/connected_accounts?user_id=eq.${encodeURIComponent(userId)}&provider=eq.gmail&email=eq.${encodeURIComponent(email)}&select=id`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const existing = existingRes.ok ? await existingRes.json().catch(() => []) : [];

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
    : null;

  const tokenPatch = {
    refresh_token: tokens.refresh_token || null,
    access_token: tokens.access_token || null,
    token_expires_at: expiresAt,
    scopes: GMAIL_SCOPES,
  };

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  if (Array.isArray(existing) && existing.length > 0) {
    const patch = await fetch(
      `${url}/rest/v1/connected_accounts?id=eq.${encodeURIComponent(existing[0].id)}`,
      { method: 'PATCH', headers, body: JSON.stringify(tokenPatch) },
    );
    if (!patch.ok) {
      const detail = await patch.text().catch(() => '');
      return { ok: false, error: detail || 'update_failed' };
    }
    return { ok: true };
  }

  const isPrimary = !Array.isArray(allAccounts) || allAccounts.length === 0;
  const insert = await fetch(`${url}/rest/v1/connected_accounts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: userId,
      provider: 'gmail',
      email,
      is_primary: isPrimary,
      ...tokenPatch,
    }),
  });

  if (!insert.ok) {
    const detail = await insert.text().catch(() => '');
    return { ok: false, error: detail || 'save_failed' };
  }

  return { ok: true };
}

export { GMAIL_SCOPES };
