import { adminToken, cors, json, verifyAdminToken } from './_support.mjs';
import { getBillingMethods, setBillingMethods } from './_billing-settings.mjs';

function requireAdmin(req) {
  const token = adminToken(req);
  if (!verifyAdminToken(token)) return null;
  return token;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!requireAdmin(req)) return json({ error: 'Unauthorized' }, 401);

  if (req.method === 'GET') {
    const result = await getBillingMethods();
    if (!result.ok) return json({ ok: false, error: result.error }, 502);
    return json({ ok: true, methods: result.methods, missing: !!result.missing });
  }

  if (req.method !== 'PATCH') return json({ error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const result = await setBillingMethods(body?.methods || body);
  if (!result.ok) {
    const status = result.error === 'billing_settings_missing' ? 503 : 502;
    return json({ ok: false, error: result.error }, status);
  }
  return json({ ok: true, methods: result.methods });
};
