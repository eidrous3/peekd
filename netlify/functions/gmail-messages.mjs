import {
  fetchGmailInbox,
  getConnectedAccounts,
  getUserFromToken,
  getValidAccessToken,
} from './_gmail.mjs';

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

  let accountEmail = '';
  let accountId = '';
  let labelIds = 'INBOX';
  let maxResults = 25;

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      accountEmail = body.accountEmail || '';
      accountId = body.accountId || '';
      if (body.labelIds) labelIds = body.labelIds;
      if (body.maxResults) maxResults = Math.min(50, Number(body.maxResults) || 25);
    } catch { /* use defaults */ }
  } else {
    const url = new URL(req.url);
    accountEmail = url.searchParams.get('accountEmail') || '';
    accountId = url.searchParams.get('accountId') || '';
    labelIds = url.searchParams.get('labelIds') || 'INBOX';
    maxResults = Math.min(50, Number(url.searchParams.get('maxResults')) || 25);
  }

  const accounts = await getConnectedAccounts(user.id, { email: accountEmail || undefined, accountId: accountId || undefined });
  if (!accounts.length) {
    return json({ ok: false, error: 'no_gmail_account', messages: [] }, 404);
  }

  const allMessages = [];
  const seen = new Set();

  for (const account of accounts) {
    const accessToken = await getValidAccessToken(account);
    if (!accessToken) continue;

    const result = await fetchGmailInbox(accessToken, { maxResults, labelIds });
    if (!result.ok) {
      return json({ ok: false, error: result.error, messages: [] }, 502);
    }

    for (const msg of result.messages) {
      const key = `${account.email}:${msg.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allMessages.push({ ...msg, accountEmail: account.email });
    }
  }

  allMessages.sort((a, b) => {
    const da = new Date(a.sentAt).getTime() || 0;
    const db = new Date(b.sentAt).getTime() || 0;
    return db - da;
  });

  return json({
    ok: true,
    messages: allMessages,
    accounts: accounts.map((a) => ({ id: a.id, email: a.email, is_primary: a.is_primary })),
  });
};
