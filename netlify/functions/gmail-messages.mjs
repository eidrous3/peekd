import {
  hideIncomingThreadReplies,
  getUserFromToken,
} from './_gmail.mjs';
import { getConnectedAccounts } from './_accounts.mjs';
import {
  accountProvider,
  enrichInboxRepliesForProviders,
  fetchProviderInbox,
  getValidTokenForAccount,
} from './_providers.mjs';
import {
  getTrackingByMessageIds,
  mergeTrackingIntoMessage,
} from './_tracking.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const DEFAULT_LABELS = ['INBOX', 'SENT'];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  let accountEmail = '';
  let accountId = '';
  let labelIds = DEFAULT_LABELS;
  let maxResults = 25;
  let enrichReplies = false;
  let listedMessages = null;

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      accountEmail = body.accountEmail || '';
      accountId = body.accountId || '';
      enrichReplies = body.enrichReplies === true;
      if (Array.isArray(body.messages) && body.messages.length) {
        listedMessages = body.messages.slice(0, 80);
      }
      if (body.labelIds) {
        labelIds = Array.isArray(body.labelIds) ? body.labelIds : String(body.labelIds).split(',');
      }
      if (body.maxResults) maxResults = Math.min(50, Number(body.maxResults) || 25);
    } catch { /* use defaults */ }
  } else {
    const url = new URL(req.url);
    accountEmail = url.searchParams.get('accountEmail') || '';
    accountId = url.searchParams.get('accountId') || '';
    enrichReplies = url.searchParams.get('enrichReplies') === '1';
    if (url.searchParams.get('labelIds')) {
      labelIds = url.searchParams.get('labelIds').split(',');
    }
    maxResults = Math.min(50, Number(url.searchParams.get('maxResults')) || 25);
  }

  const labels = [...new Set((labelIds.length ? labelIds : DEFAULT_LABELS).map((l) => String(l).trim()).filter(Boolean))];

  const accounts = await getConnectedAccounts(user.id, { email: accountEmail || undefined, accountId: accountId || undefined });
  if (!accounts.length) {
    return json({ ok: false, error: 'no_connected_account', messages: [] }, 404);
  }

  const accountPayload = accounts.map((a) => ({
    id: a.id,
    email: a.email,
    provider: accountProvider(a),
    is_primary: a.is_primary,
  }));

  // Background pass: reply-badge the rows the client already listed. Skip another
  // mailbox round-trip so the first paint stays fast.
  if (enrichReplies && listedMessages?.length) {
    let messagesWithReplies = listedMessages;
    try {
      messagesWithReplies = await enrichInboxRepliesForProviders(accounts, listedMessages);
    } catch {
      /* keep the listed rows if thread walking fails */
    }
    return json({
      ok: true,
      messages: hideIncomingThreadReplies(messagesWithReplies),
      accounts: accountPayload,
    });
  }

  const seen = new Set();
  let listError = null;

  const batches = await Promise.all(accounts.map(async (account) => {
    const provider = accountProvider(account);
    const accessToken = await getValidTokenForAccount(account);
    if (!accessToken) {
      return { error: 'token_refresh_failed', messages: [] };
    }

    const results = await Promise.all(
      labels.map((label) => fetchProviderInbox(provider, accessToken, { maxResults, label })),
    );

    const messages = [];
    let error = null;
    for (const result of results) {
      if (!result.ok) {
        error = error || result.error;
        continue;
      }
      for (const msg of result.messages || []) {
        messages.push({ ...msg, provider, accountEmail: account.email });
      }
    }
    return { error, messages };
  }));

  const allMessages = [];
  for (const batch of batches) {
    if (batch.error) listError = listError || batch.error;
    for (const msg of batch.messages) {
      const key = `${msg.accountEmail}:${msg.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allMessages.push(msg);
    }
  }

  // One broken mailbox shouldn't blank the whole inbox; only fail when nothing loaded.
  if (!allMessages.length && listError) {
    return json({ ok: false, error: listError, messages: [] }, 502);
  }

  // internalDate is exact for both providers; the formatted sentAt is a fallback.
  const sortKey = (m) => m.internalDate || new Date(m.sentAt).getTime() || 0;
  allMessages.sort((a, b) => sortKey(b) - sortKey(a));

  // Outlook rows are keyed on their Message-ID rather than the mailbox item id.
  const trackingKey = (message) => message.trackingKey || message.id;

  const messageIds = allMessages.map(trackingKey).filter(Boolean);
  let trackingByMessageId = {};
  try {
    trackingByMessageId = await getTrackingByMessageIds(user.id, messageIds, {
      skipGeo: !enrichReplies,
    });
  } catch {
    /* inbox must still load if tracking lookup fails */
  }
  const messages = allMessages.map((message) => mergeTrackingIntoMessage(
    message,
    trackingByMessageId[trackingKey(message)],
  ));

  let messagesWithReplies = messages;
  if (enrichReplies) {
    try {
      messagesWithReplies = await enrichInboxRepliesForProviders(accounts, messages);
    } catch {
      /* inbox must still load if reply detection fails */
    }
  }

  const visibleMessages = hideIncomingThreadReplies(messagesWithReplies);

  return json({
    ok: true,
    messages: visibleMessages,
    accounts: accountPayload,
  });
};
