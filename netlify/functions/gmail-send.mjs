import {
  getConnectedAccounts,
  getUserFromToken,
  getValidAccessToken,
  sendGmailMessage,
} from './_gmail.mjs';

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

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
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

  const fromEmail = String(body.fromEmail || '').trim().toLowerCase();
  const to = Array.isArray(body.to) ? body.to.map((e) => String(e).trim().toLowerCase()).filter(isEmail) : [];
  const subject = String(body.subject || '').trim();
  const html = String(body.html || '').trim();
  const addBranding = body.addBranding === true;

  if (!fromEmail) return json({ error: 'from_required' }, 400);
  if (!to.length) return json({ error: 'to_required' }, 400);
  if (!subject) return json({ error: 'subject_required' }, 400);
  if (!html) return json({ error: 'body_required' }, 400);

  const accounts = await getConnectedAccounts(user.id, { email: fromEmail });
  const account = accounts[0];
  if (!account) return json({ error: 'no_gmail_account' }, 404);

  const accessToken = await getValidAccessToken(account);
  if (!accessToken) return json({ error: 'token_refresh_failed' }, 502);

  let finalHtml = html;
  if (addBranding) {
    finalHtml += '<p style="margin-top:24px;font-size:11px;color:#94a3b8;">Tracked by Peekd</p>';
  }

  const sent = await sendGmailMessage(accessToken, {
    from: fromEmail,
    to,
    subject,
    html: finalHtml,
  });

  if (!sent.ok) return json({ ok: false, error: sent.error }, 502);

  return json({
    ok: true,
    messageId: sent.messageId,
    threadId: sent.threadId,
  });
};
