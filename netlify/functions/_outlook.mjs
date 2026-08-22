import { callbackUri } from './_oauth.mjs';
import { getConnectedAccounts, patchAccountTokens } from './_accounts.mjs';
import { markRecipientReplied } from './_tracking.mjs';
import {
  formatSentAt,
  initials,
  normalizeEmail,
  relativeTime,
} from './_mail-format.mjs';

const GRAPH = 'https://graph.microsoft.com/v1.0';

// Mail.ReadWrite (not just Mail.Read) is required because we create the message as
// a draft before sending it, which is how we learn its conversation id.
export const OUTLOOK_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Mail.ReadWrite',
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

async function sendOutlookDraft(accessToken, draft) {
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

/** Graph draft that continues an existing conversation, so the reply threads. */
async function createReplyDraft(accessToken, replyToMessageId, { subject, html, recipients, files }) {
  const res = await fetch(`${GRAPH}/me/messages/${encodeURIComponent(replyToMessageId)}/createReply`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const draft = await res.json().catch(() => ({}));
  if (!res.ok || !draft.id) return null;

  // createReply seeds its own quoted body and recipients; replace them with ours.
  const patchRes = await fetch(`${GRAPH}/me/messages/${encodeURIComponent(draft.id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: String(subject || draft.subject || ''),
      body: { contentType: 'HTML', content: html || '<p></p>' },
      toRecipients: recipients,
    }),
  });
  if (!patchRes.ok) {
    // Fall back to a plain send rather than stranding a half-built draft.
    await fetch(`${GRAPH}/me/messages/${encodeURIComponent(draft.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
    return null;
  }

  for (const file of files) {
    await fetch(`${GRAPH}/me/messages/${encodeURIComponent(draft.id)}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(file),
    }).catch(() => {});
  }

  const readRes = await fetch(
    `${GRAPH}/me/messages/${encodeURIComponent(draft.id)}?$select=id,internetMessageId,conversationId`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const full = await readRes.json().catch(() => ({}));
  return { ...draft, ...full, id: draft.id };
}

/**
 * Send via Microsoft Graph as a draft-then-send pair. `/me/sendMail` would be one
 * call but returns no identifiers, and we need the conversation id to detect
 * replies later, so we create the message first to read its ids.
 */
export async function sendOutlookMessage(accessToken, { to, subject, html, attachments, replyToMessageId }) {
  const recipients = graphRecipients(to);
  if (!accessToken || !recipients.length) return { ok: false, error: 'invalid_send' };

  const files = graphAttachments(attachments);

  let draft = replyToMessageId
    ? await createReplyDraft(accessToken, replyToMessageId, { subject, html, recipients, files })
    : null;
  if (draft) return sendOutlookDraft(accessToken, draft);

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

  draft = await draftRes.json().catch(() => ({}));
  if (!draftRes.ok || !draft.id) {
    const code = draft.error?.code || draftRes.status;
    console.error('[outlook] draft create failed:', draftRes.status, JSON.stringify(draft.error || {}).slice(0, 500));
    // Tokens issued before Mail.ReadWrite was requested can't create drafts; a
    // refresh won't widen granted scopes, so the account has to be reconnected.
    if (code === 'ErrorAccessDenied' || draftRes.status === 403) {
      return { ok: false, error: 'outlook_reconnect_required' };
    }
    return { ok: false, error: `outlook_draft_failed: ${code}` };
  }

  return sendOutlookDraft(accessToken, draft);
}

export async function fetchOutlookMessageBody(accessToken, messageId) {
  if (!accessToken || !messageId) return { ok: false, error: 'invalid_request' };

  const res = await fetch(
    `${GRAPH}/me/messages/${encodeURIComponent(messageId)}?$select=body,bodyPreview,internetMessageId,conversationId`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error?.code || 'outlook_message_failed' };

  const isHtml = data.body?.contentType?.toLowerCase() === 'html';
  const content = data.body?.content || '';
  return {
    ok: true,
    html: isHtml ? content : '',
    text: isHtml ? (data.bodyPreview || '') : (content || data.bodyPreview || ''),
    rfcMessageId: data.internetMessageId || '',
    threadId: data.conversationId || null,
  };
}

const AUTOMATED_SENDER_RE = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce)/i;

/** Gmail label names the inbox UI understands, mapped to Graph well-known folders. */
const FOLDER_BY_LABEL = {
  INBOX: 'inbox',
  SENT: 'sentitems',
};

export function outlookFolderForLabel(label) {
  return FOLDER_BY_LABEL[String(label || '').toUpperCase()] || null;
}

const MESSAGE_SELECT = [
  'id',
  'conversationId',
  'internetMessageId',
  'subject',
  'bodyPreview',
  'from',
  'sender',
  'toRecipients',
  'ccRecipients',
  'receivedDateTime',
  'sentDateTime',
  'isRead',
  'isDraft',
].join(',');

function graphPerson(emailAddress) {
  const email = normalizeEmail(emailAddress?.address);
  const name = String(emailAddress?.name || '').trim();
  return { name: name || email.split('@')[0] || 'Unknown', email };
}

function mapOutlookMessage(msg, { inSent }) {
  const from = graphPerson(msg.from?.emailAddress || msg.sender?.emailAddress);
  const to = graphPerson(msg.toRecipients?.[0]?.emailAddress);
  const date = new Date(msg.sentDateTime || msg.receivedDateTime || Date.now());
  const displayPerson = inSent ? to : from;

  return {
    id: msg.id,
    // Outlook's per-mailbox message id is opaque and changes when a draft is sent,
    // so tracking rows are keyed on the stable RFC 5322 Message-ID instead.
    trackingKey: msg.internetMessageId || msg.id,
    provider: 'outlook',
    threadId: msg.conversationId || null,
    rfcMessageId: msg.internetMessageId || '',
    internalDate: date.getTime(),
    from: from.email,
    initials: initials(displayPerson.name, displayPerson.email),
    name: displayPerson.name || displayPerson.email.split('@')[0],
    email: displayPerson.email,
    subject: msg.subject || '(No subject)',
    preview: msg.bodyPreview || '',
    badge: inSent ? 'SENT' : '',
    opens: 0,
    time: relativeTime(date),
    sentAt: formatSentAt(date),
    unread: msg.isRead === false,
    hot: false,
    to: to.name || to.email.split('@')[0],
    toEmail: to.email,
    cc: (msg.ccRecipients || []).map((r) => normalizeEmail(r?.emailAddress?.address)).filter(Boolean),
    bcc: [],
    device: '—',
    location: '—',
    lastOpened: '—',
    timeline: [
      { type: inSent ? 'sent' : 'delivered', label: inSent ? 'Sent' : 'Received', meta: formatSentAt(date) },
    ],
    links: [],
    ai: null,
    // The inbox collapses incoming replies into their sent message by looking for
    // this marker, so Outlook sent items advertise it too.
    gmailLabelIds: inSent ? ['SENT'] : [],
  };
}

/** List one mail folder, shaped exactly like `fetchGmailInbox` results. */
export async function fetchOutlookInbox(accessToken, { maxResults = 25, folder = 'inbox' } = {}) {
  if (!accessToken) return { ok: false, error: 'missing_token' };

  const params = new URLSearchParams({
    $select: MESSAGE_SELECT,
    $top: String(maxResults),
    $orderby: folder === 'sentitems' ? 'sentDateTime desc' : 'receivedDateTime desc',
  });

  const res = await fetch(
    `${GRAPH}/me/mailFolders/${encodeURIComponent(folder)}/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[outlook] message list failed:', res.status, JSON.stringify(data.error || {}).slice(0, 300));
    return { ok: false, error: data.error?.code || 'outlook_list_failed' };
  }

  const inSent = folder === 'sentitems';
  const messages = (Array.isArray(data.value) ? data.value : [])
    .filter((msg) => msg?.id && !msg.isDraft)
    .map((msg) => mapOutlookMessage(msg, { inSent }));

  return { ok: true, messages };
}

export async function fetchOutlookMailboxCount(accessToken) {
  if (!accessToken) return { ok: false, error: 'missing_token' };
  const res = await fetch(
    `${GRAPH}/me/mailFolders/inbox?$select=totalItemCount,unreadItemCount`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error?.code || 'outlook_folder_failed' };
  }
  return { ok: true, count: Number(data.totalItemCount) || 0 };
}

/**
 * Tag sent Outlook messages that already have a reply, mirroring the Gmail
 * enrichment: badge them REPLIED, add a timeline entry and persist the reply.
 */
export async function enrichOutlookInboxWithReplies(accounts, messages) {
  if (!Array.isArray(messages) || !messages.length) return messages;

  const byAccount = new Map();
  for (const message of messages) {
    if (message.provider !== 'outlook') continue;
    if (!(message.gmailLabelIds || []).includes('SENT') || !message.threadId) continue;
    const key = normalizeEmail(message.accountEmail);
    if (!key) continue;
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key).push(message);
  }
  if (!byAccount.size) return messages;

  const replyByMessageId = new Map();

  for (const account of accounts || []) {
    const subset = byAccount.get(normalizeEmail(account.email));
    if (!subset?.length) continue;

    const accessToken = await getValidOutlookAccessToken(account);
    if (!accessToken) continue;

    const conversationIds = [...new Set(subset.map((msg) => msg.threadId))];
    const byConversation = new Map();
    await Promise.all(conversationIds.map(async (id) => {
      byConversation.set(id, await fetchOutlookConversation(accessToken, id));
    }));

    for (const message of subset) {
      const reply = findOutlookReply(byConversation.get(message.threadId), {
        accountEmail: account.email,
        sentAt: message.internalDate,
        recipientEmail: message.toEmail,
      });
      if (!reply) continue;

      replyByMessageId.set(message.id, reply);

      // Fire and forget: the inbox still shows the reply if the DB write fails.
      markRecipientReplied({
        trackedEmailId: message.trackedEmailId || null,
        gmailMessageId: message.trackingKey,
        recipientEmail: reply.email,
        repliedAt: reply.repliedAt,
      }).catch(() => {});
    }
  }

  if (!replyByMessageId.size) return messages;

  return messages.map((message) => {
    const reply = replyByMessageId.get(message.id);
    if (!reply) return message;

    const timeline = [...(message.timeline || [])];
    if (!timeline.some((event) => event.type === 'replied')) {
      timeline.push({
        type: 'replied',
        who: reply.who,
        av: initials(reply.who, reply.email),
        label: 'replied',
        time: formatSentAt(new Date(reply.repliedAt)),
      });
    }

    return { ...message, badge: 'REPLIED', timeline };
  });
}

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

export async function fetchOutlookThreadForReply(accessToken, { threadId, messageId } = {}) {
  if (!accessToken) return { ok: false, error: 'missing_token' };

  const ordered = [];
  const indexById = new Map();

  if (threadId) {
    const select = 'id,from,sender,receivedDateTime,sentDateTime,bodyPreview';
    const filter = `conversationId eq '${String(threadId).replace(/'/g, "''")}'`;
    const query = `${GRAPH}/me/messages?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=20`;
    const res = await fetch(query, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.value) && data.value.length) {
      const subset = [...data.value]
        .sort((a, b) => new Date(a.receivedDateTime || a.sentDateTime || 0) - new Date(b.receivedDateTime || b.sentDateTime || 0))
        .slice(-8);
      for (const msg of subset) {
        const from = msg.from?.emailAddress || msg.sender?.emailAddress || {};
        const text = String(msg.bodyPreview || '').replace(/\s+/g, ' ').trim();
        indexById.set(msg.id, ordered.length);
        ordered.push({
          from: from.name ? `${from.name} <${from.address}>` : (from.address || ''),
          date: msg.receivedDateTime || msg.sentDateTime || '',
          text: text.slice(0, 2500),
        });
      }
    }
  }

  if (messageId) {
    const one = await fetchOutlookMessageBody(accessToken, messageId);
    if (one.ok) {
      const text = (one.text || String(one.html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 4000);
      const prev = indexById.has(messageId) ? ordered[indexById.get(messageId)] : null;
      const row = {
        from: prev?.from || '',
        date: prev?.date || '',
        text: text || prev?.text || '',
      };
      if (prev) ordered[indexById.get(messageId)] = row;
      else ordered.push(row);
    }
  }

  const messages = ordered.filter((msg) => msg.text);
  if (messages.length) return { ok: true, messages };
  return { ok: false, error: 'thread_unavailable' };
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

  let latest = null;
  for (const msg of candidates) {
    if (sentMs && msg.at <= sentMs) continue;
    if (msg.email === own) continue;
    if (AUTOMATED_SENDER_RE.test(msg.email.split('@')[0] || '')) continue;
    if (target && msg.email !== target) continue;
    latest = { email: msg.email, who: msg.name, repliedAt: new Date(msg.at).toISOString(), at: msg.at };
  }

  return latest;
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
        const recipientEmail = normalizeEmail(recip.email);
        if (!recipientEmail) continue;

        const reply = findOutlookReply(messages, {
          accountEmail: account.email,
          sentAt: row.sent_at,
          recipientEmail,
        });
        if (!reply) continue;
        const prev = recip.replied_at ? new Date(recip.replied_at).getTime() : 0;
        const next = reply.at || (reply.repliedAt ? new Date(reply.repliedAt).getTime() : 0);
        if (recip.is_replied && prev && next <= prev + 1000) continue;

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
