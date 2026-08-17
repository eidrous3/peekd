import { cors, json } from './_support.mjs';
import { getBillingMethods } from './_billing-settings.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const result = await getBillingMethods();
  if (!result.ok) return json({ ok: false, error: result.error }, 502);
  return json({ ok: true, methods: result.methods });
};
