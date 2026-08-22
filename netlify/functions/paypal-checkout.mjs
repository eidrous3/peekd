import { cors, json, bearerToken, getUserFromToken } from './_support.mjs';
import { getBillingMethods } from './_billing-settings.mjs';
import { createSubscriptionCheckout } from './_paypal.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  const billing = await getBillingMethods();
  if (billing.ok && billing.methods.paypal === false) {
    return json({ error: 'paypal_disabled' }, 403);
  }

  const session = await createSubscriptionCheckout({
    userId: user.id,
    email: user.email,
  });
  if (!session.ok) {
    const status = session.error === 'paypal_not_configured' ? 503 : 502;
    return json({ error: session.error }, status);
  }
  return json({ ok: true, url: session.url });
};
