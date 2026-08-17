import { cors, json, bearerToken, getUserFromToken } from './_support.mjs';
import { getBillingMethods } from './_billing-settings.mjs';
import { redeemCoupon } from './_coupons.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const billing = await getBillingMethods();
  if (billing.ok && billing.methods.coupons === false) {
    return json({ error: 'coupons_disabled' }, 403);
  }

  const result = await redeemCoupon(user.id, body?.code);
  if (!result.ok) {
    const status = result.error === 'coupons_missing' ? 503 : 400;
    return json({ error: result.error }, status);
  }
  return json({ ok: true, plan: result.plan });
};
