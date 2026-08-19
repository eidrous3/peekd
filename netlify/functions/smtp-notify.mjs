import { cors, json, bearerToken, getUserFromToken, dbRequest } from './_support.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  const existing = await dbRequest(
    `smtp_requestors?user_id=eq.${encodeURIComponent(user.id)}&select=id&limit=1`,
  );
  if (/schema cache|relation .*smtp_requestors/i.test(existing.error || '')) {
    return json({ error: 'smtp_requestors_missing' }, 503);
  }
  const already = existing.ok && Array.isArray(existing.data) && !!existing.data[0];

  if (req.method === 'GET') {
    return json({ ok: true, requested: already });
  }

  if (already) {
    return json({ ok: true, already: true });
  }

  const insert = await dbRequest('smtp_requestors', {
    method: 'POST',
    body: {
      user_id: user.id,
      email: String(user.email || '').trim().toLowerCase(),
    },
    prefer: 'return=minimal',
  });

  if (!insert.ok) {
    const duplicate = /duplicate|unique/i.test(insert.error || '');
    if (duplicate) return json({ ok: true, already: true });
    return json({ error: insert.error || 'insert_failed' }, 502);
  }

  return json({ ok: true, already: false });
};
