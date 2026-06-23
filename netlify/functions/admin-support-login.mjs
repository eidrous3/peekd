import {
  adminEmail,
  adminPassword,
  cors,
  json,
  signAdminToken,
} from './_support.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!adminPassword()) {
    return json({ error: 'admin_not_configured' }, 503);
  }

  if (email !== adminEmail() || password !== adminPassword()) {
    return json({ error: 'invalid_credentials' }, 401);
  }

  return json({
    ok: true,
    token: signAdminToken(),
    email: adminEmail(),
  });
};
