import { cors, json, bearerToken, getUserFromToken } from './_support.mjs';
import { deleteAiKey, listAiKeys, upsertAiKey } from './_ai-keys.mjs';

function statusFor(error) {
  if (error === 'ai_keys_missing' || error === 'keys_not_configured') return 503;
  if (error === 'invalid_provider' || error === 'key_required' || error === 'key_too_short'
    || error === 'base_url_required' || error === 'base_url_invalid') return 400;
  return 502;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const token = bearerToken(req);
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  if (req.method === 'GET') {
    const listed = await listAiKeys(user.id);
    if (!listed.ok) return json({ error: listed.error }, statusFor(listed.error));
    return json({ ok: true, keys: listed.keys });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const url = new URL(req.url, 'http://localhost');
  const provider = String(body.provider || url.searchParams.get('provider') || '').trim();

  if (req.method === 'DELETE') {
    const removed = await deleteAiKey(user.id, provider);
    if (!removed.ok) return json({ error: removed.error }, statusFor(removed.error));
    return json({ ok: true });
  }

  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'PUT') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const saved = await upsertAiKey(user.id, {
    provider,
    apiKey: body.apiKey || body.key,
    baseUrl: body.baseUrl,
    model: body.model,
  });
  if (!saved.ok) return json({ error: saved.error }, statusFor(saved.error));
  return json({ ok: true, key: saved.key });
};
