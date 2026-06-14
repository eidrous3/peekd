(function () {
  function cfg() { return window.PeekdConfig || {}; }

  function ready() {
    const { supabaseUrl, supabasePublishableKey, supabaseAnonKey } = cfg();
    const key = supabasePublishableKey || supabaseAnonKey;
    return !!(supabaseUrl && key);
  }

  function client() {
    if (!ready()) return null;
    if (!window.__peekdSupabase) {
      const { supabaseUrl, supabasePublishableKey, supabaseAnonKey } = cfg();
      const key = supabasePublishableKey || supabaseAnonKey;
      window.__peekdSupabase = window.supabase.createClient(supabaseUrl, key);
    }
    return window.__peekdSupabase;
  }

  function cleanEmail(raw) {
    const S = window.PeekdSanitize;
    const result = S.sanitizeEmail(raw);
    if (!result.ok) {
      const err = new Error(result.error);
      err.code = 'invalid_email';
      throw err;
    }
    return result.email;
  }

  function wrapError(err) {
    const wrapped = new Error(window.PeekdSanitize.formatAuthError(err));
    wrapped.code = err.code;
    return wrapped;
  }

  async function checkEmailExists(email) {
    try {
      const res = await fetch('/.netlify/functions/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { exists: false, checked: false };
      return { exists: data.exists === true, checked: true };
    } catch {
      return { exists: false, checked: false };
    }
  }

  // Supabase returns an empty identities array when the email is already registered.
  async function probeExistingViaSignUp(email) {
    const sb = client();
    if (!sb) return false;
    const { data, error } = await sb.auth.signUp({
      email,
      password: `Pk${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}1!`,
    });
    if (data?.user?.identities?.length === 0) return true;
    if (error && /already|registered|exists/i.test(error.message || '')) return true;
    return false;
  }

  async function sendMagicLink(email, { signup = false } = {}) {
    const sb = client();
    if (!sb) throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Netlify.');

    const clean = cleanEmail(email);
    const redirectTo = new URL('Peekd Dashboard.html', window.location.href).href;
    let existingUser = false;
    let shouldCreateUser = signup;

    if (signup) {
      const check = await checkEmailExists(clean);
      existingUser = check.exists;
      if (!check.checked) existingUser = await probeExistingViaSignUp(clean);
      if (existingUser) shouldCreateUser = false;
    }

    const { error } = await sb.auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: redirectTo, shouldCreateUser },
    });
    if (error) throw wrapError(error);
    return { email: clean, existingUser: !!existingUser };
  }

  async function signInWithOAuth(provider) {
    const sb = client();
    if (!sb) throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Netlify.');
    const allowed = ['google', 'azure'];
    if (!allowed.includes(provider)) throw new Error('Unsupported sign-in provider.');
    const redirectTo = new URL('Peekd Dashboard.html', window.location.href).href;
    const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) throw wrapError(error);
  }

  async function getSession() {
    const sb = client();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  window.PeekdAuth = { ready, sendMagicLink, signInWithOAuth, getSession };
})();
