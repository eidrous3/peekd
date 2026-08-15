// Peekd dashboard — Paddle Billing overlay checkout + customer portal.
(function () {
  const SCRIPT = 'https://cdn.paddle.com/paddle/v2/paddle.js';
  let loading = null;
  let waiter = null;

  function cfg() {
    const c = window.PeekdConfig || {};
    const token = String(c.paddleClientToken || '').trim();
    const flag = String(c.paddleSandbox || '').toLowerCase();
    return {
      token,
      priceId: String(c.paddlePriceId || '').trim(),
      sandbox: flag === 'true' || flag === '1' || flag === 'sandbox' || token.startsWith('test_'),
    };
  }

  function configured() {
    const { token, priceId } = cfg();
    return !!(token && priceId);
  }

  function loadScript() {
    if (window.Paddle) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(new Error('paddle_script'));
      };
      document.head.appendChild(s);
    });
    return loading;
  }

  async function ensure() {
    const { token, sandbox } = cfg();
    if (!token) throw new Error('not_configured');
    await loadScript();
    if (window.__peekdPaddleReady) return;
    if (sandbox && window.Paddle.Environment?.set) window.Paddle.Environment.set('sandbox');
    window.Paddle.Initialize({
      token,
      eventCallback(event) {
        if (!waiter) return;
        if (event.name === 'checkout.completed') waiter.completed = true;
        if (event.name === 'checkout.closed') {
          const current = waiter;
          waiter = null;
          current.resolve(current.completed ? 'completed' : 'closed');
        }
      },
    });
    window.__peekdPaddleReady = true;
  }

  async function openCheckout({ userId, email, customerId, dark } = {}) {
    if (!configured()) return { status: 'error', error: 'Payments are not set up yet' };
    if (!userId) return { status: 'error', error: 'Sign in to upgrade' };
    try {
      await ensure();
    } catch {
      return { status: 'error', error: 'Could not load Paddle checkout' };
    }

    const { priceId } = cfg();
    const result = new Promise((resolve) => {
      waiter = { completed: false, resolve };
    });
    const payload = {
      items: [{ priceId, quantity: 1 }],
      customData: { user_id: String(userId) },
      settings: {
        displayMode: 'overlay',
        variant: 'one-page',
        theme: dark ? 'dark' : 'light',
        allowLogout: false,
      },
    };
    if (customerId) payload.customer = { id: customerId };
    else if (email) payload.customer = { email };

    try {
      window.Paddle.Checkout.open(payload);
    } catch (err) {
      waiter = null;
      return { status: 'error', error: err?.message || 'Could not open checkout' };
    }
    return { status: await result };
  }

  async function waitForPremium(fetchProfile, { attempts = 20, delayMs = 1000 } = {}) {
    for (let i = 0; i < attempts; i += 1) {
      const res = await fetchProfile();
      if (res?.ok && window.PeekdProfile?.isProPlan?.(res.profile?.plan)) return res.profile;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return null;
  }

  async function openPortal() {
    const session = await window.PeekdAuth?.ensureSession?.();
    const token = session?.access_token;
    if (!token) return { ok: false, error: 'no_session' };
    let res;
    try {
      res = await fetch('/.netlify/functions/paddle-portal', {
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

  window.PeekdPaddle = { configured, openCheckout, waitForPremium, openPortal };
})();
