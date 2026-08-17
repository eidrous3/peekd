import { cors, json, bearerToken, getUserFromToken } from './_support.mjs';
import { getBillingMethods } from './_billing-settings.mjs';
import { createCheckoutSession, loadStripeProfile } from './_stripe.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  const billing = await getBillingMethods();
  if (billing.ok && billing.methods.stripe === false) {
    return json({ error: 'stripe_disabled' }, 403);
  }

  const loaded = await loadStripeProfile(user.id);
  const session = await createCheckoutSession({
    userId: user.id,
    email: user.email,
    customerId: loaded.ok ? loaded.profile.stripe_customer_id : '',
  });
  if (!session.ok) {
    const status = session.error === 'stripe_not_configured' ? 503 : 502;
    return json({ error: session.error }, status);
  }
  return json({ ok: true, url: session.url });
};
