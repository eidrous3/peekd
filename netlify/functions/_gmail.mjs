import { markRecipientReplied } from './_tracking.mjs';
import {
  getConnectedAccounts as getAccounts,
  patchAccountTokens as patchTokens,
  saveConnectedAccount as saveAccount,
} from './_accounts.mjs';
import {
  callbackUri,
  dashboardUrl,
  decodeState,
  encodeState,
  makeState,
  siteOrigin,
} from './_oauth.mjs';
import {
  formatSentAt,
  headerValue,
  initials,
  isAutomatedReplyEmail,
  normalizeEmail,
  parseEmailHeader,
  relativeTime,
} from './_mail-format.mjs';

export {
  dashboardUrl,
  decodeState,
  encodeState,
  makeState,
  siteOrigin,
};

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

export function gmailRedirectUri(req) {
  return callbackUri(req, 'gmail-callback');
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
  return saveAccount({ userId, email, tokens, provider: 'gmail', scopes: GMAIL_SCOPES });
}

export async function getConnectedAccounts(userId, { email, accountId } = {}) {
  return getAccounts(userId, { email, accountId, provider: 'gmail' });
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
  return patchTokens(accountId, tokens);
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
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`,
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
      // RFC 5322 Message-ID, used as In-Reply-To/References when replying.
      rfcMessageId: headerValue(data.payload?.headers, 'Message-ID') || '',
      internalDate: Number(data.internalDate || 0),
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

export async function fetchGmailThread(accessToken, threadId) {
  if (!accessToken || !threadId) return null;

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return data;
}

export function findReplyInThread(thread, { accountEmail, sentMessageId, sentInternalDate, recipientEmail }) {
  if (!thread?.messages?.length) return null;

  const sender = normalizeEmail(accountEmail);
  const recipient = normalizeEmail(recipientEmail);
  const messages = [...thread.messages].sort(
    (a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0),
  );

  const sentMessage = messages.find((msg) => msg.id === sentMessageId);
  const anchorDate = Number(sentMessage?.internalDate || sentInternalDate || 0);

  for (const msg of messages) {
    const msgDate = Number(msg.internalDate || 0);
    if (!msgDate || msgDate <= anchorDate) continue;

    const from = parseEmailHeader(headerValue(msg.payload?.headers, 'From'));
    const fromEmail = normalizeEmail(from.email);
    if (!fromEmail || fromEmail === sender) continue;
    if (isAutomatedReplyEmail(fromEmail)) continue;

    const labels = msg.labelIds || [];
    const isIncoming = !labels.includes('SENT');
    const fromRecipient = recipient && fromEmail === recipient;

    if (fromRecipient || isIncoming) {
      return {
        who: from.name || from.email.split('@')[0],
        email: fromEmail,
        initials: initials(from.name, from.email),
        time: formatSentAt(new Date(msgDate)),
        internalDate: msgDate,
      };
    }
  }

  return null;
}

export async function enrichMessagesWithReplies(accessToken, messages, accountEmail) {
  if (!accessToken || !Array.isArray(messages) || !messages.length) return messages;

  const sentMessages = messages.filter((msg) => (msg.gmailLabelIds || []).includes('SENT') && msg.threadId);
  if (!sentMessages.length) return messages;

  const threadIds = [...new Set(sentMessages.map((msg) => msg.threadId).filter(Boolean))];
  const threadById = new Map();

  await Promise.all(threadIds.map(async (threadId) => {
    const thread = await fetchGmailThread(accessToken, threadId);
    if (thread) threadById.set(threadId, thread);
  }));

  return Promise.all(messages.map(async (message) => {
    if (!(message.gmailLabelIds || []).includes('SENT') || !message.threadId) return message;

    const thread = threadById.get(message.threadId);
    const reply = findReplyInThread(thread, {
      accountEmail,
      sentMessageId: message.id,
      sentInternalDate: message.internalDate,
      recipientEmail: message.toEmail,
    });

    if (!reply) return message;

    // Persist for analytics — fire and forget; inbox UI still updates even if DB write fails.
    markRecipientReplied({
      trackedEmailId: message.trackedEmailId || null,
      gmailMessageId: message.id,
      recipientEmail: reply.email,
      repliedAt: reply.internalDate,
    }).catch(() => {});

    const timeline = [...(message.timeline || [])];
    const hasReplyEvent = timeline.some((event) => event.type === 'replied');
    if (!hasReplyEvent) {
      timeline.push({
        type: 'replied',
        who: reply.who,
        av: reply.initials,
        label: 'replied',
        time: reply.time,
      });
    }

    return {
      ...message,
      badge: 'REPLIED',
      timeline,
    };
  }));
}

export async function enrichInboxWithReplies(accounts, messages) {
  if (!Array.isArray(messages) || !messages.length) return messages;

  const byAccount = new Map();
  for (const message of messages) {
    const key = message.accountEmail;
    if (!key) continue;
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key).push(message);
  }

  let enriched = messages;
  for (const account of accounts || []) {
    const subset = byAccount.get(account.email);
    if (!subset?.length) continue;

    const accessToken = await getValidAccessToken(account);
    if (!accessToken) continue;

    const updatedSubset = await enrichMessagesWithReplies(accessToken, subset, account.email);
    const updatedById = new Map(updatedSubset.map((msg) => [msg.id, msg]));
    enriched = enriched.map((msg) => (
      msg.accountEmail === account.email && updatedById.has(msg.id)
        ? updatedById.get(msg.id)
        : msg
    ));
  }

  return enriched;
}

/**
 * Check Gmail threads for tracked sends and mark recipients as replied.
 * Used by campaigns (and similar) so replies are counted without requiring an Inbox visit.
 */
export async function syncRepliesForTrackedEmails(userId, trackedEmails) {
  const rows = (trackedEmails || []).filter((row) => row?.gmail_thread_id
    && row?.gmail_message_id
    && (row.provider || 'gmail') === 'gmail');
  if (!userId || !rows.length) return { ok: true, updated: 0 };

  const accounts = await getConnectedAccounts(userId);
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

    const accessToken = await getValidAccessToken(account);
    if (!accessToken) continue;

    const threadIds = [...new Set(subset.map((r) => r.gmail_thread_id).filter(Boolean))];
    const threadById = new Map();
    await Promise.all(threadIds.map(async (threadId) => {
      const thread = await fetchGmailThread(accessToken, threadId);
      if (thread) threadById.set(threadId, thread);
    }));

    for (const row of subset) {
      const thread = threadById.get(row.gmail_thread_id);
      if (!thread) continue;
      const recipients = Array.isArray(row.tracked_recipients) ? row.tracked_recipients : [];
      for (const recip of recipients) {
        if (recip.is_replied) continue;
        const recipientEmail = normalizeEmail(recip.email);
        if (!recipientEmail) continue;
        const reply = findReplyInThread(thread, {
          accountEmail: account.email,
          sentMessageId: row.gmail_message_id,
          sentInternalDate: row.sent_at ? new Date(row.sent_at).getTime() : 0,
          recipientEmail,
        });
        if (!reply) continue;
        // Always mark the tracked recipient (reply From may use an alias).
        const res = await markRecipientReplied({
          trackedEmailId: row.id,
          gmailMessageId: row.gmail_message_id,
          recipientEmail,
          repliedAt: reply.internalDate,
        });
        if (res.ok) updated += 1;
      }
    }
  }

  return { ok: true, updated };
}

/** Drop inbox-only messages when the same thread already has a sent message in the list. */
export function hideIncomingThreadReplies(messages) {
  if (!Array.isArray(messages) || !messages.length) return messages;

  const sentThreadKeys = new Set(
    messages
      .filter((msg) => (msg.gmailLabelIds || []).includes('SENT') && msg.threadId)
      .map((msg) => `${msg.accountEmail || ''}:${msg.threadId}`),
  );

  return messages.filter((msg) => {
    if ((msg.gmailLabelIds || []).includes('SENT')) return true;
    if (!msg.threadId) return true;
    return !sentThreadKeys.has(`${msg.accountEmail || ''}:${msg.threadId}`);
  });
}

function decodeBody(data) {
  if (!data) return '';
  try {
    return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

/** Depth-first search of the MIME tree, preferring HTML over plain text. */
function findPart(payload, mimeType) {
  if (!payload) return '';
  if (payload.mimeType === mimeType && payload.body?.data) return decodeBody(payload.body.data);
  for (const part of payload.parts || []) {
    const found = findPart(part, mimeType);
    if (found) return found;
  }
  return '';
}

export async function fetchGmailMessageBody(accessToken, messageId) {
  if (!accessToken || !messageId) return { ok: false, error: 'invalid_request' };

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error?.message || 'gmail_message_failed' };

  return {
    ok: true,
    html: findPart(data.payload, 'text/html'),
    text: findPart(data.payload, 'text/plain') || data.snippet || '',
    rfcMessageId: headerValue(data.payload?.headers, 'Message-ID') || '',
    threadId: data.threadId || null,
  };
}

export function encodeRawEmail(raw) {
  return Buffer.from(raw, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function headerSafe(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

export function buildMimeMessage({ from, to, subject, html, attachments = [], inReplyTo, references }) {
  const toLine = to.join(', ');
  const safeSubject = String(subject || '').replace(/\r?\n/g, ' ');
  const bodyHtml = html || '<p></p>';
  const headers = [
    `From: ${from}`,
    `To: ${toLine}`,
    `Subject: ${safeSubject}`,
  ];

  // Threading headers: mail clients chain a conversation on these.
  const replyTo = headerSafe(inReplyTo);
  const chain = headerSafe(references) || replyTo;
  if (replyTo) headers.push(`In-Reply-To: ${replyTo}`);
  if (chain) headers.push(`References: ${chain}`);

  headers.push('MIME-Version: 1.0');

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

export async function sendGmailMessage(accessToken, { from, to, subject, html, attachments, inReplyTo, references, threadId }) {
  const raw = buildMimeMessage({ from, to, subject, html, attachments, inReplyTo, references });
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    // Gmail needs threadId as well as the headers to file this into the thread.
    body: JSON.stringify({ raw: encodeRawEmail(raw), ...(threadId ? { threadId } : {}) }),
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
