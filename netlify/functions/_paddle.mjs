import crypto from 'crypto';
import { dbRequest } from './_support.mjs';

const TS_TOLERANCE_SEC = 300;

function paddleApiBase() {
  const key = process.env.PADDLE_API_KEY || '';
  const flag = String(process.env.PADDLE_SANDBOX || '').trim().toLowerCase();
  const sandbox = flag === '1' || flag === 'true' || flag === 'sandbox' || key.includes('_sdbx_');
  return sandbox ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
}

export function paddleApiKey() {
  return String(process.env.PADDLE_API_KEY || '').trim();
}

export function webhookSecret() {
  return String(process.env.PADDLE_WEBHOOK_SECRET || '').trim();
}

export function verifyPaddleSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader || rawBody == null) return false;
  const parts = {};
  for (const part of String(signatureHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key && value) parts[key] = value;
  }
  const ts = Number(parts.ts);
  const h1 = parts.h1;
  if (!Number.isFinite(ts) || !h1) return false;
  const age = Math.abs(Date.now() / 1000 - ts);
  if (age > TS_TOLERANCE_SEC) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${ts}:${rawBody}`)
    .digest('hex');
  const provided = String(h1).toLowerCase();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function customUserId(data) {
  const custom = data?.custom_data || {};
  return String(custom.user_id || custom.userId || '').trim();
}

async function findUserId(data) {
  const fromCustom = customUserId(data);
  if (fromCustom) return fromCustom;

  const customerId = String(data?.customer_id || '').trim();
  if (customerId) {
    const res = await dbRequest(
      `profiles?paddle_customer_id=eq.${encodeURIComponent(customerId)}&select=id&limit=1`,
    );
    const row = Array.isArray(res.data) ? res.data[0] : null;
    if (row?.id) return row.id;
  }

  const subId = String(
    (String(data?.id || '').startsWith('sub_') ? data.id : data?.subscription_id) || '',
  ).trim();
  if (subId) {
    const res = await dbRequest(
      `profiles?paddle_subscription_id=eq.${encodeURIComponent(subId)}&select=id&limit=1`,
    );
    const row = Array.isArray(res.data) ? res.data[0] : null;
    if (row?.id) return row.id;
  }

  return '';
}

async function patchProfile(userId, body) {
  if (!userId || !Object.keys(body).length) return { ok: false, error: 'nothing_to_patch' };
  return dbRequest(
    `profiles?id=eq.${encodeURIComponent(userId)}`,
    { method: 'PATCH', body, prefer: 'return=minimal' },
  );
}

function billingIds(data) {
  const customerId = String(data?.customer_id || '').trim() || undefined;
  const subscriptionId = String(
    (String(data?.id || '').startsWith('sub_') ? data.id : data?.subscription_id) || '',
  ).trim() || undefined;
  const patch = {};
  if (customerId) patch.paddle_customer_id = customerId;
  if (subscriptionId) patch.paddle_subscription_id = subscriptionId;
  return patch;
}

async function grantPremium(data) {
  const userId = await findUserId(data);
  if (!userId) return { ok: false, error: 'user_not_found' };
  return patchProfile(userId, { plan: 'premium', ...billingIds(data) });
}

async function revokePremium(data) {
  const userId = await findUserId(data);
  if (!userId) return { ok: false, error: 'user_not_found' };
  return patchProfile(userId, { plan: 'free', ...billingIds(data) });
}

const GRANT_EVENTS = new Set([
  'transaction.paid',
  'transaction.completed',
  'subscription.created',
  'subscription.activated',
  'subscription.trialing',
  'subscription.resumed',
]);

const REVOKE_EVENTS = new Set([
  'subscription.canceled',
  'subscription.paused',
]);

export async function handlePaddleEvent(event) {
  const type = String(event?.event_type || '');
  const data = event?.data || {};
  const status = String(data.status || '').toLowerCase();

  if (GRANT_EVENTS.has(type)) {
    if (type.startsWith('subscription.') && status && !['active', 'trialing'].includes(status)) {
      return { ok: true, skipped: true, type };
    }
    const res = await grantPremium(data);
    return { ...res, type, action: 'grant' };
  }

  if (REVOKE_EVENTS.has(type) || (type === 'subscription.updated' && ['canceled', 'paused'].includes(status))) {
    const res = await revokePremium(data);
    return { ...res, type, action: 'revoke' };
  }

  if (type === 'subscription.updated' && ['active', 'trialing'].includes(status)) {
    const res = await grantPremium(data);
    return { ...res, type, action: 'grant' };
  }

  return { ok: true, skipped: true, type };
}

export async function createPortalSession(customerId, subscriptionId) {
  const key = paddleApiKey();
  if (!key) return { ok: false, error: 'paddle_not_configured' };
  if (!customerId) return { ok: false, error: 'no_customer' };

  const payload = {};
  if (subscriptionId) payload.subscription_ids = [subscriptionId];

  const res = await fetch(
    `${paddleApiBase()}/customers/${encodeURIComponent(customerId)}/portal-sessions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Paddle-Version': '1',
      },
      body: JSON.stringify(payload),
    },
  );
  const json = await res.json().catch(() => ({}));
  const url = json?.data?.urls?.general?.overview;
  if (!res.ok || !url) {
    return { ok: false, error: json?.error?.detail || json?.error || 'portal_failed' };
  }
  return { ok: true, url };
}

export async function loadBillingProfile(userId) {
  const res = await dbRequest(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id,plan,paddle_customer_id,paddle_subscription_id`,
  );
  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!res.ok || !row) return { ok: false, error: 'profile_not_found' };
  return { ok: true, profile: row };
}
