import { dbRequest, isDeveloper, siteUrl } from './_support.mjs';

const LIVE_API = 'https://api-m.paypal.com';
const SANDBOX_API = 'https://api-m.sandbox.paypal.com';

const INACTIVE = new Set(['CANCELLED', 'EXPIRED', 'SUSPENDED']);

export function paypalClientId() {
  return String(process.env.PAYPAL_CLIENT_ID || '').trim();
}

export function paypalClientSecret() {
  return String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
}

export function paypalPlanId() {
  return String(process.env.PAYPAL_PLAN_ID || '').trim();
}

export function paypalAnnualPlanId() {
  return String(process.env.PAYPAL_ANNUAL_PLAN_ID || '').trim();
}

export function paypalTestPlanId() {
  return String(process.env.PAYPAL_TEST_PLAN_ID || '').trim();
}

const PAYPAL_PLAN_KEYS = new Set(['monthly', 'annual', 'test']);

export function resolvePayPalPlanId(planKey) {
  const key = String(planKey || 'monthly').trim().toLowerCase();
  if (key === 'annual') return paypalAnnualPlanId();
  if (key === 'test') return paypalTestPlanId();
  if (key === 'monthly' || !key) return paypalPlanId();
  return '';
}

export function isPayPalPlanKey(planKey) {
  return PAYPAL_PLAN_KEYS.has(String(planKey || 'monthly').trim().toLowerCase());
}

export function paypalWebhookId() {
  return String(process.env.PAYPAL_WEBHOOK_ID || '').trim();
}

export function paypalSandbox() {
  const flag = String(process.env.PAYPAL_SANDBOX || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'sandbox';
}

export function paypalApi() {
  return paypalSandbox() ? SANDBOX_API : LIVE_API;
}

export function paypalConfigured() {
  return !!(
    paypalClientId()
    && paypalClientSecret()
    && (paypalPlanId() || paypalAnnualPlanId() || paypalTestPlanId())
  );
}

export function paypalManageUrl() {
  return paypalSandbox()
    ? 'https://www.sandbox.paypal.com/myaccount/autopay/'
    : 'https://www.paypal.com/myaccount/autopay/';
}

async function paypalAccessToken() {
  const id = paypalClientId();
  const secret = paypalClientSecret();
  if (!id || !secret) return { ok: false, error: 'paypal_not_configured' };

  const res = await fetch(`${paypalApi()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    return { ok: false, error: data.error_description || data.error || 'paypal_auth_failed' };
  }
  return { ok: true, token: data.access_token };
}

async function paypalJson(path, body, { method = 'POST', token, requestId } = {}) {
  const auth = token ? { ok: true, token } : await paypalAccessToken();
  if (!auth.ok) return auth;

  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
  };
  if (requestId) headers['PayPal-Request-Id'] = requestId;

  const res = await fetch(`${paypalApi()}${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.details) && data.details[0]?.description;
    return { ok: false, error: detail || data.message || data.error || 'paypal_error', data };
  }
  return { ok: true, data };
}

export async function createSubscriptionCheckout({ userId, email, plan = 'monthly' } = {}) {
  if (!paypalConfigured()) return { ok: false, error: 'paypal_not_configured' };
  if (!userId) return { ok: false, error: 'user_required' };
  if (!isPayPalPlanKey(plan)) return { ok: false, error: 'unknown_plan' };

  const planId = resolvePayPalPlanId(plan);
  if (!planId) return { ok: false, error: 'plan_not_configured' };

  if (String(plan).trim().toLowerCase() === 'test' && !isDeveloper(email)) {
    return { ok: false, error: 'test_plan_forbidden' };
  }

  const dashboard = `${siteUrl()}/Peekd%20Dashboard.html`;
  const payload = {
    plan_id: planId,
    custom_id: String(userId).slice(0, 127),
    application_context: {
      brand_name: 'Peekd',
      locale: 'en-US',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'SUBSCRIBE_NOW',
      return_url: `${dashboard}?billing=success`,
      cancel_url: `${dashboard}?billing=cancel`,
    },
  };
  if (email) payload.subscriber = { email_address: email };

  const created = await paypalJson('/v1/billing/subscriptions', payload, {
    requestId: crypto.randomUUID(),
  });
  const approve = (created.data?.links || []).find((link) => link.rel === 'approve');
  if (!created.ok || !approve?.href) {
    return { ok: false, error: created.error || 'checkout_failed' };
  }
  return { ok: true, url: approve.href, subscriptionId: created.data?.id || '' };
}

function paypalHostAllowed(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return parsed.hostname === 'api.paypal.com'
      || parsed.hostname === 'api.sandbox.paypal.com'
      || parsed.hostname.endsWith('.paypal.com');
  } catch {
    return false;
  }
}

export async function verifyPayPalWebhook(headers, event) {
  const webhookId = paypalWebhookId();
  if (!webhookId) return false;
  const certUrl = String(headers.get('paypal-cert-url') || '');
  if (!paypalHostAllowed(certUrl)) return false;

  const result = await paypalJson('/v1/notifications/verify-webhook-signature', {
    auth_algo: headers.get('paypal-auth-algo') || '',
    cert_url: certUrl,
    transmission_id: headers.get('paypal-transmission-id') || '',
    transmission_sig: headers.get('paypal-transmission-sig') || '',
    transmission_time: headers.get('paypal-transmission-time') || '',
    webhook_id: webhookId,
    webhook_event: event,
  });
  return result.ok && String(result.data?.verification_status || '') === 'SUCCESS';
}

export async function loadPayPalProfile(userId) {
  const res = await dbRequest(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id,plan,paypal_customer_id,paypal_subscription_id`,
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
  if (customerId) patch.paypal_customer_id = customerId;
  if (subscriptionId) patch.paypal_subscription_id = subscriptionId;
  return patch;
}

async function findUserId({ userId, customerId, subscriptionId } = {}) {
  if (userId) return userId;
  if (customerId) {
    const res = await dbRequest(
      `profiles?paypal_customer_id=eq.${encodeURIComponent(customerId)}&select=id&limit=1`,
    );
    const row = Array.isArray(res.data) ? res.data[0] : null;
    if (row?.id) return row.id;
  }
  if (subscriptionId) {
    const res = await dbRequest(
      `profiles?paypal_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id&limit=1`,
    );
    const row = Array.isArray(res.data) ? res.data[0] : null;
    if (row?.id) return row.id;
  }
  return '';
}

async function grantPremium(ids) {
  const userId = await findUserId(ids);
  if (!userId) return { ok: false, error: 'user_not_found' };
  const loaded = await loadPayPalProfile(userId);
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
  const loaded = await loadPayPalProfile(userId);
  if (loaded.ok && loaded.profile.plan === 'lifetime') {
    return { ok: true, skipped: true };
  }
  return patchProfile(userId, { plan: 'free', ...billingIds(ids) });
}

function resourceIds(resource = {}) {
  const rawId = String(resource.id || '').trim();
  const agreement = String(resource.billing_agreement_id || resource.billing_agreement || '').trim();
  const subscriptionId = agreement || (rawId.startsWith('I-') ? rawId : '');
  const customerId = String(
    resource.subscriber?.payer_id
    || resource.payer_id
    || resource.payer?.payer_id
    || '',
  ).trim();
  const userId = String(
    resource.custom_id
    || resource.custom
    || resource.custom_id_1
    || '',
  ).trim();
  const status = String(resource.status || resource.state || '').toUpperCase();
  return { userId, customerId, subscriptionId, status };
}

export async function handlePayPalEvent(event) {
  const type = String(event?.event_type || '');
  const ids = resourceIds(event?.resource || {});

  if (
    type === 'BILLING.SUBSCRIPTION.ACTIVATED'
    || type === 'PAYMENT.SALE.COMPLETED'
    || type === 'PAYMENT.CAPTURE.COMPLETED'
  ) {
    const res = await grantPremium(ids);
    return { ...res, type, action: 'grant' };
  }

  if (type === 'BILLING.SUBSCRIPTION.CREATED' || type === 'BILLING.SUBSCRIPTION.UPDATED') {
    if (INACTIVE.has(ids.status)) {
      const res = await revokePremium(ids);
      return { ...res, type, action: 'revoke' };
    }
    if (ids.status === 'ACTIVE') {
      const res = await grantPremium(ids);
      return { ...res, type, action: 'grant' };
    }
    return { ok: true, skipped: true, type };
  }

  if (
    type === 'BILLING.SUBSCRIPTION.CANCELLED'
    || type === 'BILLING.SUBSCRIPTION.EXPIRED'
    || type === 'BILLING.SUBSCRIPTION.SUSPENDED'
  ) {
    const res = await revokePremium(ids);
    return { ...res, type, action: 'revoke' };
  }

  return { ok: true, skipped: true, type };
}
