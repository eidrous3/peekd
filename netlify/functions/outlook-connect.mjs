import { getUserFromToken } from './_gmail.mjs';
import { makeState } from './_oauth.mjs';
import {
  outlookAuthorizeUrl,
  outlookClientId,
  outlookRedirectUri,
} from './_outlook.mjs';

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

  const clientId = outlookClientId();
  const redirectUri = outlookRedirectUri(req);
  if (!clientId || !redirectUri) {
    return json({ error: 'Outlook is not configured', reason: 'missing_outlook_config' }, 503);
  }

  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  return json({
    ok: true,
    url: outlookAuthorizeUrl({
      clientId,
      redirectUri,
      state: makeState(user.id),
    }),
  });
};
