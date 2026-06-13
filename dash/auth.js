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

  async function sendMagicLink(email, { signup = false } = {}) {
    const sb = client();
    if (!sb) throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Netlify.');

    const clean = cleanEmail(email);
    const redirectTo = new URL('Peekd Dashboard.html', window.location.href).href;
    const { error } = await sb.auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: signup },
    });
    if (error) throw wrapError(error);
    return clean;
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
