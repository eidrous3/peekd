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

function supabaseUrl() {
  return (process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || '';
}

function publicKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || serviceKey();
}

async function getUserFromToken(accessToken) {
  const url = supabaseUrl();
  const key = publicKey();
  if (!url || !key || !accessToken) return null;

  const res = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) return null;
  return res.json();
}

function affectedCount(res) {
  const range = res.headers.get('content-range');
  if (!range) return null;
  const total = range.split('/')[1];
  if (!total || total === '*') return null;
  const n = parseInt(total, 10);
  return Number.isFinite(n) ? n : null;
}

async function softDeleteProfile(userId) {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key) return { ok: false, error: 'missing_config' };

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'count=exact,return=minimal',
  };

  const patch = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ is_deleted: true }),
  });

  if (patch.ok) {
    const n = affectedCount(patch);
    if (n === null || n > 0) return { ok: true };
  }

  const upsert = await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'resolution=merge-duplicates,count=exact,return=minimal',
    },
    body: JSON.stringify({ id: userId, is_deleted: true }),
  });

  if (upsert.ok) return { ok: true };

  const patchBody = patch.ok ? '' : await patch.text().catch(() => '');
  const upsertBody = await upsert.text().catch(() => '');
  const detail = upsertBody || patchBody;
  return { ok: false, error: detail || 'profile_update_failed', status: upsert.status || patch.status };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  const result = await softDeleteProfile(user.id);
  if (!result.ok) {
    return json({ ok: false, error: result.error, reason: result.error === 'missing_config' ? 'missing_config' : 'delete_failed' }, result.status || 500);
  }

  return json({ ok: true });
};
