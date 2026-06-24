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

export async function getConnectedAccounts(userId, { email, accountId } = {}) {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key) return [];

  let q = `${url}/rest/v1/connected_accounts?user_id=eq.${encodeURIComponent(userId)}&provider=eq.gmail&select=id,email,is_primary,refresh_token,access_token,token_expires_at`;
  if (accountId) q += `&id=eq.${encodeURIComponent(accountId)}`;
  else if (email) q += `&email=eq.${encodeURIComponent(email)}`;

  const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) return [];
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

export async function refreshAccessToken(refreshToken) {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) return null;
  return data;
}

export async function patchAccountTokens(accountId, tokens) {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key) return;

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
    : null;

  await fetch(`${url}/rest/v1/connected_accounts?id=eq.${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      access_token: tokens.access_token,
      token_expires_at: expiresAt,
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    }),
  });
}

export async function getValidAccessToken(account) {
  if (!account) return null;

  const expires = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  const stillValid = account.access_token && expires > Date.now() + 60_000;
  if (stillValid) return account.access_token;

  if (!account.refresh_token) return account.access_token || null;

  const refreshed = await refreshAccessToken(account.refresh_token);
  if (!refreshed) return account.access_token || null;

  await patchAccountTokens(account.id, refreshed);
  return refreshed.access_token;
}

function parseEmailHeader(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?$/);
  if (m) return { name: (m[1] || m[2].split('@')[0] || '').trim(), email: m[2].trim().toLowerCase() };
  return { name: s.split('@')[0] || 'Unknown', email: s.toLowerCase() };
}

function headerValue(headers, name) {
  const h = (headers || []).find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function initials(name, email) {
  const n = (name || '').trim();
  if (n && n !== email) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const e = (email || '').trim();
  return e ? e.slice(0, 2).toUpperCase() : '?';
}

function relativeTime(date) {
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return 'Just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 172_800_000) return 'Yesterday';
  if (ms < 604_800_000) return `${Math.floor(ms / 86_400_000)} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSentAt(date) {
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
}

export async function fetchGmailInbox(accessToken, { maxResults = 25, labelIds = 'INBOX' } = {}) {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    labelIds,
  });

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  const listData = await listRes.json().catch(() => ({}));
  if (!listRes.ok) {
    return { ok: false, error: listData.error?.message || 'gmail_list_failed' };
  }

  const ids = (listData.messages || []).map((m) => m.id).filter(Boolean);
  const messages = await Promise.all(ids.map(async (id) => {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;

    const from = parseEmailHeader(headerValue(data.payload?.headers, 'From'));
    const toRaw = headerValue(data.payload?.headers, 'To');
    const toFirst = toRaw.split(',')[0]?.trim() || '';
    const to = parseEmailHeader(toFirst);
    const subject = headerValue(data.payload?.headers, 'Subject') || '(No subject)';
    const dateRaw = headerValue(data.payload?.headers, 'Date');
    const date = dateRaw ? new Date(dateRaw) : new Date(Number(data.internalDate || Date.now()));
    const unread = (data.labelIds || []).includes('UNREAD');
    const inSent = (data.labelIds || []).includes('SENT');
    const displayPerson = inSent ? to : from;

    return {
      id: data.id,
      threadId: data.threadId,
      from: from.email,
      initials: initials(displayPerson.name, displayPerson.email),
      name: displayPerson.name || displayPerson.email.split('@')[0],
      email: displayPerson.email,
      subject,
      preview: data.snippet || '',
      badge: inSent ? 'SENT' : '',
      opens: 0,
      time: relativeTime(date),
      sentAt: formatSentAt(date),
      unread,
      hot: false,
      to: to.name || to.email.split('@')[0],
      toEmail: to.email || toRaw,
      cc: [],
      bcc: [],
      device: '—',
      location: '—',
      lastOpened: '—',
      timeline: [
        { type: inSent ? 'sent' : 'delivered', label: inSent ? 'Sent' : 'Received', meta: formatSentAt(date) },
      ],
      links: [],
      ai: null,
      gmailLabelIds: data.labelIds || [],
    };
  }));

  return { ok: true, messages: messages.filter(Boolean) };
}

export function encodeRawEmail(raw) {
  return Buffer.from(raw, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function buildMimeMessage({ from, to, subject, html, attachments = [] }) {
  const toLine = to.join(', ');
  const safeSubject = String(subject || '').replace(/\r?\n/g, ' ');
  const bodyHtml = html || '<p></p>';
  const headers = [
    `From: ${from}`,
    `To: ${toLine}`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
  ];

  if (!attachments.length) {
    return [
      ...headers,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      bodyHtml,
    ].join('\r\n');
  }

  const boundary = `peekd_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const parts = [
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    bodyHtml,
  ];

  for (const att of attachments) {
    const filename = String(att.filename || att.name || 'attachment').replace(/[\r\n"]/g, '_');
    const mimeType = att.mimeType || att.contentType || 'application/octet-stream';
    const data = String(att.data || att.content || '').replace(/\s/g, '');
    const folded = data.match(/.{1,76}/g)?.join('\r\n') || data;
    parts.push(
      `--${boundary}`,
      `Content-Type: ${mimeType}; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      folded,
    );
  }

  parts.push(`--${boundary}--`, '');

  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    ...parts,
  ].join('\r\n');
}

export async function sendGmailMessage(accessToken, { from, to, subject, html, attachments }) {
  const raw = buildMimeMessage({ from, to, subject, html, attachments });
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodeRawEmail(raw) }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error?.message || 'gmail_send_failed' };
  }

  return { ok: true, messageId: data.id, threadId: data.threadId };
}

export {
  GMAIL_SCOPES,
  parseEmailHeader,
  headerValue,
  initials,
  relativeTime,
  formatSentAt,
};
