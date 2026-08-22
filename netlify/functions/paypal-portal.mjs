import { cors, json, bearerToken, getUserFromToken } from './_support.mjs';
import { loadPayPalProfile, paypalManageUrl } from './_paypal.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  const loaded = await loadPayPalProfile(user.id);
  if (!loaded.ok) return json({ error: loaded.error || 'profile_not_found' }, 404);

  if (!loaded.profile.paypal_subscription_id && !loaded.profile.paypal_customer_id) {
    return json({ error: 'no_paypal_customer', message: 'This account has no PayPal billing profile yet.' }, 404);
  }

  return json({ ok: true, url: paypalManageUrl() });
};
