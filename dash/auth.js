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

  async function sendMagicLink(email) {
    const sb = client();
    if (!sb) throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Netlify.');
    const redirectTo = new URL('Peekd Dashboard.html', window.location.href).href;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    if (error) throw error;
  }

  async function signInWithOAuth(provider) {
    const sb = client();
    if (!sb) throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Netlify.');
    const redirectTo = new URL('Peekd Dashboard.html', window.location.href).href;
    const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) throw error;
  }

  async function getSession() {
    const sb = client();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  window.PeekdAuth = { ready, sendMagicLink, signInWithOAuth, getSession };
})();
