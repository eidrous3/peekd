import { handleStripeEvent, stripeWebhookSecret, verifyStripeSignature } from './_stripe.mjs';

export default async (req) => {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, service: 'stripe-webhook' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = stripeWebhookSecret();
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, error: 'webhook_not_configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature') || '';
  if (!verifyStripeSignature(rawBody, signature, secret)) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await handleStripeEvent(event);
    if (!result.ok && result.error === 'user_not_found') {
      console.warn('[stripe-webhook] no matching user', event.type, event?.data?.object?.id);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'user_not_found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!result.ok) {
      console.error('[stripe-webhook] handler failed', result);
      return new Response(JSON.stringify({ ok: false, error: result.error || 'handler_failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, type: result.type, action: result.action || 'ignored' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[stripe-webhook] fatal', err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || 'fatal' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
