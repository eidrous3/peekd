// Peekd dashboard — Stripe Checkout redirect + customer portal.
(function () {
  function configured() {
    return !!String(window.PeekdConfig?.stripePriceId || '').trim();
  }

  async function waitForPremium(fetchProfile, { attempts = 20, delayMs = 1000 } = {}) {
    if (window.PeekdPaddle?.waitForPremium) {
      return window.PeekdPaddle.waitForPremium(fetchProfile, { attempts, delayMs });
    }
    for (let i = 0; i < attempts; i += 1) {
      const res = await fetchProfile();
      if (res?.ok && window.PeekdProfile?.isProPlan?.(res.profile?.plan)) return res.profile;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return null;
  }

  async function openCheckout() {
    if (!configured()) return { status: 'error', error: 'Payments are not set up yet' };
    const session = await window.PeekdAuth?.ensureSession?.();
    const token = session?.access_token;
    if (!token) return { status: 'error', error: 'Sign in to upgrade' };

    let res;
    try {
      res = await fetch('/.netlify/functions/stripe-checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      return { status: 'error', error: 'Could not reach Stripe checkout' };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      if (data.error === 'stripe_disabled') return { status: 'error', error: 'Stripe checkout is turned off' };
      if (data.error === 'stripe_not_configured') return { status: 'error', error: 'Stripe is not set up yet' };
      return { status: 'error', error: data.error || 'Could not open Stripe checkout' };
    }
    window.location.assign(data.url);
    return { status: 'redirect' };
  }

  async function openPortal() {
    const session = await window.PeekdAuth?.ensureSession?.();
    const token = session?.access_token;
    if (!token) return { ok: false, error: 'no_session' };
    let res;
    try {
      res = await fetch('/.netlify/functions/stripe-portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      return { ok: false, error: 'portal_unreachable' };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) return { ok: false, error: data.error || 'portal_failed' };
    window.open(data.url, '_blank', 'noopener,noreferrer');
    return { ok: true };
  }

  window.PeekdStripe = { configured, openCheckout, waitForPremium, openPortal };
})();
