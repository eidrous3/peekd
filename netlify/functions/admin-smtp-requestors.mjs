import { adminToken, cors, dbRequest, json, verifyAdminToken } from './_support.mjs';

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

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!requireAdmin(req)) return json({ error: 'Unauthorized' }, 401);
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const res = await dbRequest(
    'smtp_requestors?select=id,user_id,email,created_at&order=created_at.desc',
  );
  if (!res.ok) {
    if (/schema cache|relation .*smtp_requestors/i.test(res.error || '')) {
      return json({ ok: true, requestors: [], missing: true });
    }
    return json({ ok: false, error: res.error }, 502);
  }

  const requestors = (Array.isArray(res.data) ? res.data : []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email || '',
    created: formatWhen(row.created_at),
    createdAt: row.created_at || null,
  }));

  return json({ ok: true, requestors });
};
