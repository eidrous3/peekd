import crypto from 'crypto';
import { dbRequest, siteUrl } from './_support.mjs';

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_VERSION = '2026-07-29.dahlia';
const TS_TOLERANCE_SEC = 300;

export function stripeSecret() {
  return String(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_RESTRICTED_KEY || '').trim();
}

export function stripePriceId() {
  return String(process.env.STRIPE_PRICE_ID || '').trim();
}

export function stripeWebhookSecret() {
  return String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
}

export function stripeConfigured() {
  return !!(stripeSecret() && stripePriceId());
}

function appendForm(body, value, prefix) {
  if (value == null || value === '') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => appendForm(body, item, `${prefix}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      appendForm(body, nested, prefix ? `${prefix}[${key}]` : key);
    }
    return;
  }
  body.append(prefix, String(value));
}

export async function stripeForm(path, params, { method = 'POST' } = {}) {
  const key = stripeSecret();
  if (!key) return { ok: false, error: 'stripe_not_configured' };

  const body = new URLSearchParams();
  appendForm(body, params, '');

  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': STRIPE_VERSION,
    },
    body: method === 'GET' ? undefined : body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data?.error?.message || 'stripe_error', data };
  }
  return { ok: true, data };
}

export function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader || rawBody == null) return false;
  const items = String(signatureHeader).split(',').map((part) => part.trim());
  const ts = items.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = items.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!ts || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > TS_TOLERANCE_SEC) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const expectedBuf = Buffer.from(expected);
  return signatures.some((sig) => {
    const provided = Buffer.from(sig);
    return provided.length === expectedBuf.length && crypto.timingSafeEqual(provided, expectedBuf);
  });
}

function integrationId() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.randomBytes(8);
  let suffix = '';
  for (let i = 0; i < 8; i += 1) suffix += letters[bytes[i] % 26];
  return `peekd-pro-${suffix}`;
}

export async function createCheckoutSession({ userId, email, customerId } = {}) {
  if (!stripeConfigured()) return { ok: false, error: 'stripe_not_configured' };
  if (!userId) return { ok: false, error: 'user_required' };

  const dashboard = `${siteUrl()}/Peekd%20Dashboard.html`;
  const params = {
    mode: 'subscription',
    line_items: [{ price: stripePriceId(), quantity: 1 }],
    success_url: `${dashboard}?billing=success`,
    cancel_url: `${dashboard}?billing=cancel`,
    client_reference_id: userId,
    metadata: { user_id: userId },
    subscription_data: { metadata: { user_id: userId } },
    integration_identifier: integrationId(),
  };
  if (customerId) params.customer = customerId;
  else if (email) params.customer_email = email;

  const session = await stripeForm('/checkout/sessions', params);
  if (!session.ok || !session.data?.url) {
    return { ok: false, error: session.error || 'checkout_failed' };
  }
  return { ok: true, url: session.data.url };
}

export async function createCustomerPortal({ customerId } = {}) {
  if (!stripeSecret()) return { ok: false, error: 'stripe_not_configured' };
  if (!customerId) return { ok: false, error: 'no_stripe_customer' };

  const session = await stripeForm('/billing_portal/sessions', {
    customer: customerId,
    return_url: `${siteUrl()}/Peekd%20Dashboard.html`,
  });
  if (!session.ok || !session.data?.url) {
    return { ok: false, error: session.error || 'portal_failed' };
  }
  return { ok: true, url: session.data.url };
}

export async function loadStripeProfile(userId) {
  const res = await dbRequest(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id,plan,stripe_customer_id,stripe_subscription_id`,
  );
  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!res.ok || !row) return { ok: false, error: 'profile_not_found' };
  return { ok: true, profile: row };
}

async function patchProfile(userId, body) {
  if (!userId || !Object.keys(body).length) return { ok: false, error: 'nothing_to_patch' };
  return dbRequest(
    `profiles?id=eq.${encodeURIComponent(userId)}`,
    { method: 'PATCH', body, prefer: 'return=minimal' },
  );
}

function billingIds({ customerId, subscriptionId } = {}) {
  const patch = {};
  if (customerId) patch.stripe_customer_id = customerId;
  if (subscriptionId) patch.stripe_subscription_id = subscriptionId;
  return patch;
}

async function findUserId({ userId, customerId, subscriptionId } = {}) {
  if (userId) return userId;
  if (customerId) {
    const res = await dbRequest(
      `profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id&limit=1`,
    );
    const row = Array.isArray(res.data) ? res.data[0] : null;
    if (row?.id) return row.id;
  }
  if (subscriptionId) {
    const res = await dbRequest(
      `profiles?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id&limit=1`,
    );
    const row = Array.isArray(res.data) ? res.data[0] : null;
    if (row?.id) return row.id;
  }
  return '';
}

async function grantPremium(ids) {
  const userId = await findUserId(ids);
  if (!userId) return { ok: false, error: 'user_not_found' };
  const loaded = await loadStripeProfile(userId);
  if (loaded.ok && loaded.profile.plan === 'lifetime') {
    const patch = billingIds(ids);
    if (!Object.keys(patch).length) return { ok: true, skipped: true };
    return patchProfile(userId, patch);
  }
  return patchProfile(userId, { plan: 'premium', ...billingIds(ids) });
}

async function revokePremium(ids) {
  const userId = await findUserId(ids);
  if (!userId) return { ok: false, error: 'user_not_found' };
  const loaded = await loadStripeProfile(userId);
  if (loaded.ok && loaded.profile.plan === 'lifetime') {
    return { ok: true, skipped: true };
  }
  return patchProfile(userId, { plan: 'free', ...billingIds(ids) });
}

function objectIds(object = {}) {
  const customerId = String(object.customer || object.customer_id || '').trim();
  const subscriptionId = String(
    object.subscription
    || (String(object.id || '').startsWith('sub_') ? object.id : '')
    || '',
  ).trim();
  const userId = String(
    object.client_reference_id
    || object.metadata?.user_id
    || object.metadata?.userId
    || '',
  ).trim();
  return { userId, customerId, subscriptionId };
}

const ACTIVE = new Set(['active', 'trialing']);
const INACTIVE = new Set(['canceled', 'unpaid', 'paused', 'incomplete_expired']);

export async function handleStripeEvent(event) {
  const type = String(event?.type || '');
  const object = event?.data?.object || {};
  const ids = objectIds(object);

  if (type === 'checkout.session.completed') {
    if (object.mode === 'subscription' && object.payment_status && object.payment_status !== 'paid' && object.payment_status !== 'no_payment_required') {
      return { ok: true, skipped: true, type };
    }
    const res = await grantPremium(ids);
    return { ...res, type, action: 'grant' };
  }

  if (type === 'customer.subscription.created' || type === 'invoice.paid') {
    const res = await grantPremium(ids);
    return { ...res, type, action: 'grant' };
  }

  if (type === 'customer.subscription.updated') {
    const status = String(object.status || '').toLowerCase();
    if (INACTIVE.has(status)) {
      const res = await revokePremium(ids);
      return { ...res, type, action: 'revoke' };
    }
    if (!status || ACTIVE.has(status)) {
      const res = await grantPremium(ids);
      return { ...res, type, action: 'grant' };
    }
    return { ok: true, skipped: true, type };
  }

  if (type === 'customer.subscription.deleted') {
    const res = await revokePremium(ids);
    return { ...res, type, action: 'revoke' };
  }

  return { ok: true, skipped: true, type };
}
