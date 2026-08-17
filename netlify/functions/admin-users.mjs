import {
  adminToken,
  cors,
  dbRequest,
  json,
  serviceKey,
  supabaseUrl,
  verifyAdminToken,
} from './_support.mjs';

function requireAdmin(req) {
  const token = adminToken(req);
  if (!verifyAdminToken(token)) return null;
  return token;
}

function formatWhen(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

async function listAuthUsers() {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key) return { ok: false, error: 'missing_config', users: [] };

  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const users = [];
  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const res = await fetch(
      `${url}/auth/v1/admin/users?${new URLSearchParams({ page: String(page), per_page: String(perPage) })}`,
      { headers },
    );
    if (!res.ok) return { ok: false, error: 'admin_api_error', users };
    const data = await res.json().catch(() => ({}));
    const batch = Array.isArray(data.users) ? data.users : [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return { ok: true, users };
}

async function fetchProfiles() {
  let res = await dbRequest('profiles?select=id,name,plan,is_deleted,created_at');
  if (res.ok && Array.isArray(res.data)) return res.data;
  res = await dbRequest('profiles?select=id,name,is_deleted,created_at');
  return res.ok && Array.isArray(res.data) ? res.data : [];
}

async function softDeleteProfile(userId) {
  const patch = await dbRequest(`profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { is_deleted: true },
    prefer: 'return=representation',
  });
  if (patch.ok && Array.isArray(patch.data) && patch.data[0]) {
    return { ok: true };
  }

  const upsert = await dbRequest('profiles?on_conflict=id', {
    method: 'POST',
    body: { id: userId, is_deleted: true },
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  if (upsert.ok) return { ok: true };
  return { ok: false, error: upsert.error || patch.error || 'delete_failed' };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!requireAdmin(req)) return json({ error: 'Unauthorized' }, 401);

  if (req.method === 'GET') {
    const authRes = await listAuthUsers();
    if (!authRes.ok) return json({ ok: false, error: authRes.error }, 502);

    const profiles = await fetchProfiles();
    const byId = new Map(profiles.map((row) => [row.id, row]));

    const users = authRes.users.map((user) => {
      const profile = byId.get(user.id) || {};
      return {
        id: user.id,
        email: user.email || '',
        name: String(profile.name || '').trim(),
        plan: String(profile.plan || 'free').trim() || 'free',
        deleted: !!profile.is_deleted,
        created: formatWhen(user.created_at),
        createdAt: user.created_at || null,
      };
    }).sort((a, b) => {
      if (a.deleted !== b.deleted) return a.deleted ? 1 : -1;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    return json({ ok: true, users });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const id = String(body.id || '').trim();
  if (!id) return json({ error: 'id_required' }, 400);

  const result = await softDeleteProfile(id);
  if (!result.ok) return json({ ok: false, error: result.error }, 502);
  return json({ ok: true, userId: id });
};
