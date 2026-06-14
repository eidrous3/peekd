(function () {
  function initials(name, email) {
    const n = (name || '').trim();
    if (n) {
      const parts = n.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      return n.slice(0, 2).toUpperCase();
    }
    const e = (email || '').trim();
    return e ? e.slice(0, 2).toUpperCase() : '?';
  }

  async function fetchProfile() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return { ok: false, error: 'not_configured' };

    const session = await Auth.getSession();
    if (!session?.user) return { ok: false, error: 'no_session' };

    const email = session.user.email || '';
    const sb = Auth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { data, error } = await sb
      .from('profiles')
      .select('id, name, timezone, is_deleted')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };

    const name = (data?.name || '').trim();
    const timezone = data?.timezone || 'America/New_York';

    return {
      ok: true,
      profile: {
        id: session.user.id,
        name,
        email,
        timezone,
        initials: initials(name, email),
        isDeleted: !!data?.is_deleted,
      },
    };
  }

  window.PeekdProfile = { fetchProfile, initials };
})();
