import { getUserFromToken } from './_gmail.mjs';
import { getConnectedAccounts } from './_accounts.mjs';
import { accountProvider, fetchProviderMessageBody, getValidTokenForAccount } from './_providers.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const messageId = String(body.messageId || '').trim();
  const accountEmail = String(body.accountEmail || '').trim().toLowerCase();
  if (!messageId) return json({ ok: false, error: 'message_id_required' }, 400);

  const accounts = await getConnectedAccounts(user.id, { email: accountEmail || undefined });
  const account = accounts[0];
  if (!account) return json({ ok: false, error: 'no_connected_account' }, 404);

  const accessToken = await getValidTokenForAccount(account);
  if (!accessToken) return json({ ok: false, error: 'token_refresh_failed' }, 502);

  const result = await fetchProviderMessageBody(accountProvider(account), accessToken, messageId);
  if (!result.ok) return json({ ok: false, error: result.error }, 502);

  return json(result);
};
