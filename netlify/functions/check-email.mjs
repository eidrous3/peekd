const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function sanitizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.replace(/[\x00-\x1F\x7F\u200B-\u200D\u2060\uFEFF]/g, '').trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) {
    return null;
  }
  return email;
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || '';
}

async function userExists(email) {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = serviceKey();
  if (!url || !key) return { exists: false, reason: 'missing_config' };

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  // Preferred: GoTrue email filter
  const filter = `email.eq.${email}`;
  const filtered = await fetch(
    `${url}/auth/v1/admin/users?${new URLSearchParams({ page: '1', per_page: '1', filter })}`,
    { headers },
  );

  if (filtered.ok) {
    const data = await filtered.json();
    const users = data.users || [];
    if (users.some((u) => (u.email || '').toLowerCase() === email)) {
      return { exists: true };
    }
    if (users.length > 0) return { exists: true };
    if (data.total != null && data.total > 0) return { exists: true };
  }

  // Fallback: paginate users (small projects)
  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const res = await fetch(
      `${url}/auth/v1/admin/users?${new URLSearchParams({ page: String(page), per_page: String(perPage) })}`,
      { headers },
    );
    if (!res.ok) return { exists: false, reason: 'admin_api_error', status: res.status };
    const data = await res.json();
    const users = data.users || [];
    if (users.some((u) => (u.email || '').toLowerCase() === email)) return { exists: true };
    if (users.length < perPage) break;
    page += 1;
  }

  return { exists: false };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const email = sanitizeEmail(body.email);
  if (!email) return json({ error: 'Invalid email' }, 400);

  const result = await userExists(email);
  return json({ exists: result.exists === true, reason: result.reason || null });
};
