import { getUserFromToken } from './_gmail.mjs';
import { getConnectedAccounts } from './_accounts.mjs';
import {
  accountProvider,
  fetchProviderMailboxCount,
  getValidTokenForAccount,
} from './_providers.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

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

  const accounts = await getConnectedAccounts(user.id);
  if (!accounts.length) {
    return json({ ok: true, inbox: 0, accounts: [] });
  }

  let inbox = 0;
  for (const account of accounts) {
    const accessToken = await getValidTokenForAccount(account);
    if (!accessToken) continue;
    const result = await fetchProviderMailboxCount(accountProvider(account), accessToken);
    if (result.ok) inbox += result.count || 0;
  }

  return json({
    ok: true,
    inbox,
    accounts: accounts.map((a) => ({
      id: a.id,
      email: a.email,
      provider: accountProvider(a),
    })),
  });
};
