import { getConnectedAccounts } from './_accounts.mjs';
import {
  getValidAccessToken,
  sendGmailMessage,
  syncRepliesForTrackedEmails,
} from './_gmail.mjs';
import {
  getValidOutlookAccessToken,
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

/**
 * Sync replies for a mixed set of tracked emails, routing each row to the API
 * that sent it. Rows without a provider are treated as Gmail (pre-migration data).
 */
export async function syncRepliesForProvider(userId, trackedEmails) {
  const rows = Array.isArray(trackedEmails) ? trackedEmails : [];
  if (!userId || !rows.length) return { ok: true, updated: 0 };

  const gmailRows = rows.filter((row) => (row?.provider || 'gmail') === 'gmail');
  const outlookRows = rows.filter((row) => row?.provider === 'outlook');

  const [gmail, outlook] = await Promise.all([
    gmailRows.length ? syncRepliesForTrackedEmails(userId, gmailRows) : { updated: 0 },
    outlookRows.length ? syncOutlookRepliesForTrackedEmails(userId, outlookRows) : { updated: 0 },
  ]);

  return { ok: true, updated: (gmail.updated || 0) + (outlook.updated || 0) };
}
