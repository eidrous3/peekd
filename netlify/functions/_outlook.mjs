import { callbackUri } from './_oauth.mjs';
import { getConnectedAccounts, patchAccountTokens } from './_accounts.mjs';
import { markRecipientReplied } from './_tracking.mjs';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export const OUTLOOK_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Mail.Read',
].join(' ');

export function outlookClientId() {
  return process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || '';
}

export function outlookClientSecret() {
  return process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET || '';
}

/** `common` lets both work and personal Microsoft accounts connect. */
export function outlookTenant() {
  return process.env.OUTLOOK_TENANT_ID || process.env.MICROSOFT_TENANT_ID || 'common';
}

export function outlookRedirectUri(req) {
  return callbackUri(req, 'outlook-callback');
}

export function outlookAuthorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: OUTLOOK_SCOPES,
    prompt: 'select_account',
    state,
  });
  return `https://login.microsoftonline.com/${outlookTenant()}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function tokenRequest(form) {
  const res = await fetch(`https://login.microsoftonline.com/${outlookTenant()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    return { ok: false, error: data.error_description || data.error || 'token_request_failed' };
  }
  return { ok: true, tokens: data };
}

export async function exchangeOutlookCode(code, redirectUri) {
  const clientId = outlookClientId();
  const clientSecret = outlookClientSecret();
  if (!clientId || !clientSecret) return { ok: false, error: 'missing_outlook_config' };

  return tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: OUTLOOK_SCOPES,
  });
}

export async function refreshOutlookToken(refreshToken) {
  const clientId = outlookClientId();
  const clientSecret = outlookClientSecret();
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: OUTLOOK_SCOPES,
  });
  return res.ok ? res.tokens : null;
}

export async function getValidOutlookAccessToken(account) {
  if (!account) return null;

  const expires = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (account.access_token && expires > Date.now() + 60_000) return account.access_token;
  if (!account.refresh_token) return account.access_token || null;

  const refreshed = await refreshOutlookToken(account.refresh_token);
  if (!refreshed) return account.access_token || null;

  await patchAccountTokens(account.id, refreshed);
  return refreshed.access_token;
}

/** Email claim out of the id_token, avoiding a Graph round-trip entirely. */
export function emailFromIdToken(idToken) {
  const payload = String(idToken || '').split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const email = claims.email || claims.preferred_username || claims.upn || '';
    return String(email).trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

export async function fetchOutlookEmail(accessToken) {
  const res = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[outlook] /me lookup failed:', res.status, detail.slice(0, 300));
    return null;
  }
  const data = await res.json().catch(() => ({}));
  const email = data.mail || data.userPrincipalName || '';
  return String(email).trim().toLowerCase() || null;
}

/** Resolve the mailbox address, preferring the id_token claim over Graph. */
export async function resolveOutlookEmail(tokens) {
  const fromToken = emailFromIdToken(tokens?.id_token);
  if (fromToken && fromToken.includes('@')) return fromToken;
  return fetchOutlookEmail(tokens?.access_token);
}

function graphRecipients(list) {
  return (Array.isArray(list) ? list : [])
    .map((address) => String(address || '').trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

function graphAttachments(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: item.filename || item.name || 'attachment',
    contentType: item.mimeType || item.contentType || 'application/octet-stream',
    contentBytes: String(item.data || item.content || '').replace(/\s/g, ''),
  }));
}

/**
 * Send via Microsoft Graph as a draft-then-send pair. `/me/sendMail` would be one
 * call but returns no identifiers, and we need the conversation id to detect
 * replies later, so we create the message first to read its ids.
 */
export async function sendOutlookMessage(accessToken, { to, subject, html, attachments }) {
  const recipients = graphRecipients(to);
  if (!accessToken || !recipients.length) return { ok: false, error: 'invalid_send' };

  const files = graphAttachments(attachments);
  const draftRes = await fetch(`${GRAPH}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: String(subject || ''),
      body: { contentType: 'HTML', content: html || '<p></p>' },
      toRecipients: recipients,
      ...(files.length ? { attachments: files } : {}),
    }),
  });

  const draft = await draftRes.json().catch(() => ({}));
  if (!draftRes.ok || !draft.id) {
    const code = draft.error?.code || draftRes.status;
    console.error('[outlook] draft create failed:', draftRes.status, JSON.stringify(draft.error || {}).slice(0, 500));
    return { ok: false, error: `outlook_draft_failed: ${code}` };
  }

  const sendRes = await fetch(`${GRAPH}/me/messages/${encodeURIComponent(draft.id)}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!sendRes.ok) {
    const detail = await sendRes.json().catch(() => ({}));
    console.error('[outlook] send failed:', sendRes.status, JSON.stringify(detail.error || {}).slice(0, 500));
    // Leave no orphaned draft in the user's mailbox when the send fails.
    await fetch(`${GRAPH}/me/messages/${encodeURIComponent(draft.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
    return { ok: false, error: `outlook_send_failed: ${detail.error?.code || sendRes.status}` };
  }

  // Sending moves the draft into Sent Items and invalidates its id, so persist the
  // stable RFC 5322 Message-ID and the conversation id instead.
  return {
    ok: true,
    messageId: draft.internetMessageId || draft.id,
    threadId: draft.conversationId || null,
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

const AUTOMATED_SENDER_RE = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce)/i;

/**
 * Every message in a conversation. Graph rejects `$orderby` combined with a
 * `conversationId` filter on large mailboxes, so we sort client-side.
 */
export async function fetchOutlookConversation(accessToken, conversationId) {
  if (!accessToken || !conversationId) return [];

  const select = 'id,conversationId,from,sender,receivedDateTime,sentDateTime,isDraft,internetMessageId';
  const query = `${GRAPH}/me/messages`
    + `?$filter=conversationId eq '${encodeURIComponent(String(conversationId).replace(/'/g, "''"))}'`
    + `&$select=${select}`
    + '&$top=50';

  const res = await fetch(query, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];

  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.value) ? data.value : [];
}

/**
 * First inbound message in a conversation after our send — i.e. the reply.
 * Mirrors the Gmail heuristic: skip our own copies, drafts and automated senders.
 */
export function findOutlookReply(messages, { accountEmail, sentAt, recipientEmail }) {
  const own = normalizeEmail(accountEmail);
  const target = normalizeEmail(recipientEmail);
  const sentMs = sentAt ? new Date(sentAt).getTime() : 0;

  const candidates = (messages || [])
    .filter((msg) => !msg.isDraft)
    .map((msg) => {
      const address = normalizeEmail(msg.from?.emailAddress?.address || msg.sender?.emailAddress?.address);
      const when = msg.receivedDateTime || msg.sentDateTime;
      return {
        email: address,
        name: msg.from?.emailAddress?.name || address,
        at: when ? new Date(when).getTime() : 0,
      };
    })
    .filter((msg) => msg.email && msg.at > 0)
    .sort((a, b) => a.at - b.at);

  for (const msg of candidates) {
    if (sentMs && msg.at <= sentMs) continue;
    if (msg.email === own) continue;
    if (AUTOMATED_SENDER_RE.test(msg.email.split('@')[0] || '')) continue;
    if (target && msg.email !== target) continue;
    return { email: msg.email, who: msg.name, repliedAt: new Date(msg.at).toISOString() };
  }

  return null;
}

/**
 * Check Outlook conversations for tracked sends and mark recipients as replied,
 * so campaigns pause on reply without needing an inbox visit.
 */
export async function syncOutlookRepliesForTrackedEmails(userId, trackedEmails) {
  const rows = (trackedEmails || []).filter((row) => row?.provider === 'outlook' && row?.gmail_thread_id);
  if (!userId || !rows.length) return { ok: true, updated: 0 };

  const accounts = await getConnectedAccounts(userId, { provider: 'outlook' });
  if (!accounts.length) return { ok: true, updated: 0 };

  const byFrom = new Map();
  for (const row of rows) {
    const from = normalizeEmail(row.from_email);
    if (!from) continue;
    if (!byFrom.has(from)) byFrom.set(from, []);
    byFrom.get(from).push(row);
  }

  let updated = 0;
  for (const account of accounts) {
    const subset = byFrom.get(normalizeEmail(account.email));
    if (!subset?.length) continue;

    const accessToken = await getValidOutlookAccessToken(account);
    if (!accessToken) continue;

    const conversationIds = [...new Set(subset.map((r) => r.gmail_thread_id).filter(Boolean))];
    const messagesByConversation = new Map();
    await Promise.all(conversationIds.map(async (id) => {
      messagesByConversation.set(id, await fetchOutlookConversation(accessToken, id));
    }));

    for (const row of subset) {
      const messages = messagesByConversation.get(row.gmail_thread_id);
      if (!messages?.length) continue;

      for (const recip of Array.isArray(row.tracked_recipients) ? row.tracked_recipients : []) {
        if (recip.is_replied) continue;
        const recipientEmail = normalizeEmail(recip.email);
        if (!recipientEmail) continue;

        const reply = findOutlookReply(messages, {
          accountEmail: account.email,
          sentAt: row.sent_at,
          recipientEmail,
        });
        if (!reply) continue;

        const res = await markRecipientReplied({
          trackedEmailId: row.id,
          recipientEmail,
          repliedAt: reply.repliedAt,
        });
        if (res.ok) updated += 1;
      }
    }
  }

  return { ok: true, updated };
}
