(function () {
  function cfg() { return window.PeekdConfig || {}; }

  function ready() {
    const { supabaseUrl, supabasePublishableKey, supabaseAnonKey } = cfg();
    const key = supabasePublishableKey || supabaseAnonKey;
    return !!(supabaseUrl && key);
  }

  function dashboardUrl() {
    return new URL('Peekd Dashboard.html', window.location.href).href;
  }

  function loginUrl() {
    return new URL('Peekd Login.html', window.location.href).href;
  }

  function client() {
    if (!ready()) return null;
    if (!window.__peekdSupabase) {
      const { supabaseUrl, supabasePublishableKey, supabaseAnonKey } = cfg();
      const key = supabasePublishableKey || supabaseAnonKey;
      window.__peekdSupabase = window.supabase.createClient(supabaseUrl, key, {
        auth: {
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
          flowType: 'pkce',
        },
      });
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

  function authParamsInUrl() {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return params.has('code')
      || params.has('error')
      || params.has('error_description')
      || hashParams.has('access_token')
      || hashParams.has('error_description');
  }

  function cleanAuthParamsFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    url.searchParams.delete('state');
    url.hash = '';
    window.history.replaceState({}, '', url.pathname + url.search);
  }

  async function completeAuthRedirect() {
    const sb = client();
    if (!sb || !authParamsInUrl()) return null;

    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const authError = params.get('error_description') || params.get('error') || hashParams.get('error_description');
    if (authError) {
      cleanAuthParamsFromUrl();
      throw wrapError(new Error(authError));
    }

    const code = params.get('code');
    if (code) {
      const { data, error } = await sb.auth.exchangeCodeForSession(code);
      cleanAuthParamsFromUrl();
      if (error) throw wrapError(error);
      return data.session || null;
    }

    const { data: { session }, error } = await sb.auth.getSession();
    cleanAuthParamsFromUrl();
    if (error) throw wrapError(error);
    return session || null;
  }

  async function sendMagicLink(email) {
    const sb = client();
    if (!sb) throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Netlify.');

    const clean = cleanEmail(email);
    const { error } = await sb.auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: dashboardUrl(), shouldCreateUser: true },
    });
    if (error) throw wrapError(error);
    return { email: clean };
  }

  async function signInWithOAuth(provider) {
    const sb = client();
    if (!sb) throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Netlify.');
    const allowed = ['google', 'azure'];
    if (!allowed.includes(provider)) throw new Error('Unsupported sign-in provider.');

    const options = {
      redirectTo: dashboardUrl(),
      skipBrowserRedirect: true,
    };

    if (provider === 'google') {
      options.queryParams = { access_type: 'online', prompt: 'select_account' };
      options.scopes = 'email profile';
    } else {
      options.scopes = 'openid profile email';
      options.queryParams = { prompt: 'select_account' };
    }

    const { data, error } = await sb.auth.signInWithOAuth({ provider, options });
    if (error) throw wrapError(error);
    if (!data?.url) throw new Error('Could not start sign-in. Try again.');
    window.location.assign(data.url);
  }

  async function getSession() {
    const sb = client();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  async function ensureSession() {
    const sb = client();
    if (!sb) return null;

    try {
      const redirected = await completeAuthRedirect();
      if (redirected) return redirected;
    } catch (err) {
      throw err;
    }

    const { data: { session } } = await sb.auth.getSession();
    if (session) return session;

    return new Promise((resolve) => {
      let done = false;
      const finish = (s) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        sub?.unsubscribe();
        resolve(s);
      };
      const timer = setTimeout(() => finish(null), 4000);
      const { data: { subscription: sub } } = sb.auth.onAuthStateChange((_event, s) => {
        if (s) finish(s);
      });
    });
  }

  async function bootstrapDashboardAuth() {
    if (!ready()) return null;
    return ensureSession();
  }

  async function redirectIfSignedIn() {
    if (!ready()) return false;
    const session = await getSession();
    if (!session) return false;
    window.location.replace(dashboardUrl());
    return true;
  }

  async function signOut() {
    const sb = client();
    if (!sb) return;
    await sb.auth.signOut();
  }

  window.PeekdAuth = {
    ready,
    client,
    sendMagicLink,
    signInWithOAuth,
    getSession,
    ensureSession,
    bootstrapDashboardAuth,
    redirectIfSignedIn,
    signOut,
  };
})();
