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

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      accountEmail = body.accountEmail || '';
      accountId = body.accountId || '';
      if (body.labelIds) {
        labelIds = Array.isArray(body.labelIds) ? body.labelIds : String(body.labelIds).split(',');
      }
      if (body.maxResults) maxResults = Math.min(50, Number(body.maxResults) || 25);
    } catch { /* use defaults */ }
  } else {
    const url = new URL(req.url);
    accountEmail = url.searchParams.get('accountEmail') || '';
    accountId = url.searchParams.get('accountId') || '';
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

  const allMessages = [];
  const seen = new Set();
  let listError = null;

  for (const account of accounts) {
    const provider = accountProvider(account);
    const accessToken = await getValidTokenForAccount(account);
    if (!accessToken) {
      listError = listError || 'token_refresh_failed';
      continue;
    }

    for (const label of labels) {
      const result = await fetchProviderInbox(provider, accessToken, { maxResults, label });
      if (!result.ok) {
        listError = listError || result.error;
        continue;
      }

      for (const msg of result.messages) {
        const key = `${account.email}:${msg.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allMessages.push({ ...msg, provider, accountEmail: account.email });
      }
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
    trackingByMessageId = await getTrackingByMessageIds(user.id, messageIds);
  } catch {
    /* inbox must still load if tracking lookup fails */
  }
  const messages = allMessages.map((message) => mergeTrackingIntoMessage(
    message,
    trackingByMessageId[trackingKey(message)],
  ));

  let messagesWithReplies = messages;
  try {
    messagesWithReplies = await enrichInboxRepliesForProviders(accounts, messages);
  } catch {
    /* inbox must still load if reply detection fails */
  }

  const visibleMessages = hideIncomingThreadReplies(messagesWithReplies);

  return json({
    ok: true,
    messages: visibleMessages,
    accounts: accounts.map((a) => ({
      id: a.id,
      email: a.email,
      provider: accountProvider(a),
      is_primary: a.is_primary,
    })),
  });
};
