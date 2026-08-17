import { cors, json, bearerToken, getUserFromToken } from './_support.mjs';
import { createCustomerPortal, loadStripeProfile } from './_stripe.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  const loaded = await loadStripeProfile(user.id);
  if (!loaded.ok) return json({ error: loaded.error || 'profile_not_found' }, 404);

  const customerId = loaded.profile.stripe_customer_id;
  if (!customerId) {
    return json({ error: 'no_stripe_customer', message: 'This account has no Stripe billing profile yet.' }, 404);
  }

  const session = await createCustomerPortal({ customerId });
  if (!session.ok) {
    const status = session.error === 'stripe_not_configured' ? 503 : 502;
    return json({ error: session.error }, status);
  }
  return json({ ok: true, url: session.url });
};
