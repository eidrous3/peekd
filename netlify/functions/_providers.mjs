import { getConnectedAccounts } from './_accounts.mjs';
import {
  enrichInboxWithReplies,
  fetchGmailInbox,
  fetchGmailMailboxCount,
  fetchGmailMessageBody,
  fetchGmailThreadForReply,
  getValidAccessToken,
  sendGmailMessage,
  syncRepliesForTrackedEmails,
} from './_gmail.mjs';
import {
  enrichOutlookInboxWithReplies,
  fetchOutlookInbox,
  fetchOutlookMailboxCount,
  fetchOutlookMessageBody,
  fetchOutlookThreadForReply,
  getValidOutlookAccessToken,
  outlookFolderForLabel,
  sendOutlookMessage,
  syncOutlookRepliesForTrackedEmails,
} from './_outlook.mjs';

export function accountProvider(account) {
  return account?.provider === 'outlook' ? 'outlook' : 'gmail';
}

export async function getValidTokenForAccount(account) {
  return accountProvider(account) === 'outlook'
    ? getValidOutlookAccessToken(account)
    : getValidAccessToken(account);
}

/**
 * Find the account a message should be sent from, regardless of provider, and
 * return a usable access token for it.
 */
export async function resolveSendAccount(userId, fromEmail, { accountId } = {}) {
  const email = String(fromEmail || '').trim().toLowerCase();
  const accounts = await getConnectedAccounts(userId, {
    ...(accountId ? { accountId } : {}),
    ...(email && !accountId ? { email } : {}),
  });

  const account = accounts[0];
  if (!account) return { ok: false, error: 'no_connected_account' };

  const accessToken = await getValidTokenForAccount(account);
  if (!accessToken) return { ok: false, error: 'token_refresh_failed' };

  return { ok: true, account, provider: accountProvider(account), accessToken };
}

export async function sendProviderMessage(provider, accessToken, message) {
  return provider === 'outlook'
    ? sendOutlookMessage(accessToken, message)
    : sendGmailMessage(accessToken, message);
}

export async function fetchProviderMessageBody(provider, accessToken, messageId) {
  return provider === 'outlook'
    ? fetchOutlookMessageBody(accessToken, messageId)
    : fetchGmailMessageBody(accessToken, messageId);
}

export async function fetchProviderThreadForReply(provider, accessToken, ids) {
  return provider === 'outlook'
    ? fetchOutlookThreadForReply(accessToken, ids)
    : fetchGmailThreadForReply(accessToken, ids);
}

/**
 * List one Gmail label / Outlook folder for an account. Labels the provider has
 * no equivalent folder for yield an empty list rather than an error.
 */
export async function fetchProviderInbox(provider, accessToken, { maxResults, label } = {}) {
  if (provider === 'outlook') {
    const folder = outlookFolderForLabel(label);
    if (!folder) return { ok: true, messages: [] };
    return fetchOutlookInbox(accessToken, { maxResults, folder });
  }
  return fetchGmailInbox(accessToken, { maxResults, labelIds: label });
}

export async function fetchProviderMailboxCount(provider, accessToken) {
  return provider === 'outlook'
    ? fetchOutlookMailboxCount(accessToken)
    : fetchGmailMailboxCount(accessToken);
}

/** Badge sent messages that already got a reply, per provider. */
export async function enrichInboxRepliesForProviders(accounts, messages) {
  const list = Array.isArray(accounts) ? accounts : [];
  const gmail = list.filter((a) => accountProvider(a) === 'gmail');
  const outlook = list.filter((a) => accountProvider(a) === 'outlook');

  const [gmailEnriched, outlookEnriched] = await Promise.all([
    gmail.length ? enrichInboxWithReplies(gmail, messages) : messages,
    outlook.length ? enrichOutlookInboxWithReplies(outlook, messages) : messages,
  ]);

  if (gmailEnriched === messages) return outlookEnriched;
  if (outlookEnriched === messages) return gmailEnriched;

  const outlookByKey = new Map(
    outlookEnriched.map((msg) => [`${msg.accountEmail || ''}:${msg.id}`, msg]),
  );
  return gmailEnriched.map((msg) => {
    const other = outlookByKey.get(`${msg.accountEmail || ''}:${msg.id}`);
    if (other?.badge === 'REPLIED') return other;
    return msg;
  });
}

function inferMailProvider(row) {
  const explicit = String(row?.provider || '').toLowerCase();
  if (explicit === 'outlook' || explicit === 'gmail') return explicit;
  const tid = String(row?.gmail_thread_id || '');
  if (/^[0-9a-f]{10,}$/i.test(tid)) return 'gmail';
  if (tid.length > 24) return 'outlook';
  return 'gmail';
}

/**
 * Sync replies for a mixed set of tracked emails, routing each row to the API
 * that sent it. Rows without a provider are inferred from the thread id.
 */
export async function syncRepliesForProvider(userId, trackedEmails) {
  const rows = Array.isArray(trackedEmails) ? trackedEmails : [];
  if (!userId || !rows.length) return { ok: true, updated: 0 };

  const gmailRows = rows.filter((row) => inferMailProvider(row) === 'gmail');
  const outlookRows = rows.filter((row) => inferMailProvider(row) === 'outlook');

  const [gmail, outlook] = await Promise.all([
    gmailRows.length ? syncRepliesForTrackedEmails(userId, gmailRows) : { updated: 0 },
    outlookRows.length ? syncOutlookRepliesForTrackedEmails(userId, outlookRows) : { updated: 0 },
  ]);

  return { ok: true, updated: (gmail.updated || 0) + (outlook.updated || 0) };
}
