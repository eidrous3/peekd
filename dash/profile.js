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

  async function restoreProfile() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return { ok: false, error: 'not_configured' };

    const session = await Auth.ensureSession();
    if (!session?.user) return { ok: false, error: 'no_session' };

    const sb = Auth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const userId = session.user.id;

    const { data, error: rpcError } = await sb.rpc('restore_profile');
    if (!rpcError) return { ok: true, restored: data === true };

    const { error: updateError, count } = await sb
      .from('profiles')
      .update({ is_deleted: false })
      .eq('id', userId)
      .select('id', { count: 'exact', head: true });

    if (!updateError && (count || 0) > 0) return { ok: true, restored: true };
    if (!updateError) return { ok: true, restored: false };

    const { error: insertError } = await sb
      .from('profiles')
      .insert({ id: userId, is_deleted: false });

    if (!insertError) return { ok: true, restored: false };

    return { ok: false, restored: false, error: insertError?.message || updateError?.message || rpcError?.message };
  }

  async function fetchProfile() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return { ok: false, error: 'not_configured' };

    const session = await Auth.ensureSession();
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

  async function updateProfile({ name, timezone } = {}) {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return { ok: false, error: 'not_configured' };

    const session = await Auth.ensureSession();
    if (!session?.user) return { ok: false, error: 'no_session' };

    const email = session.user.email || '';
    const sb = Auth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const payload = { id: session.user.id };
    if (name !== undefined) payload.name = String(name).trim();
    if (timezone !== undefined) {
      const tz = String(timezone).trim();
      payload.timezone = tz || 'America/New_York';
    }

    const { data, error } = await sb
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('id, name, timezone, is_deleted')
      .single();

    if (error) return { ok: false, error: error.message };

    const savedName = (data?.name || '').trim();
    const savedTimezone = data?.timezone || 'America/New_York';

    return {
      ok: true,
      profile: {
        id: session.user.id,
        name: savedName,
        email,
        timezone: savedTimezone,
        initials: initials(savedName, email),
        isDeleted: !!data?.is_deleted,
      },
    };
  }

  async function softDeleteProfile() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return { ok: false, error: 'not_configured' };

    const session = await Auth.ensureSession();
    if (!session?.user) return { ok: false, error: 'no_session' };

    const sb = Auth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const userId = session.user.id;
    const token = session.access_token;

    try {
      const res = await fetch('/.netlify/functions/delete-account', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) return { ok: true };
      if (data.reason !== 'missing_config' && res.status !== 404) {
        console.error('[Peekd] delete-account function failed:', { status: res.status, data });
        if (data.error) return { ok: false, error: data.error };
      }
    } catch (err) {
      console.error('[Peekd] delete-account function unreachable:', err);
    }

    const { error: rpcError } = await sb.rpc('soft_delete_profile');
    if (!rpcError) return { ok: true };

    const { error: updateError } = await sb
      .from('profiles')
      .update({ is_deleted: true })
      .eq('id', userId);

    if (!updateError) return { ok: true };

    const { error: insertError } = await sb
      .from('profiles')
      .insert({ id: userId, is_deleted: true });

    if (!insertError) return { ok: true };

    const msg = insertError?.message || updateError?.message || rpcError?.message || 'delete_failed';
    console.error('[Peekd] soft delete failed:', { rpcError, updateError, insertError });
    return { ok: false, error: msg };
  }

  window.PeekdProfile = { fetchProfile, updateProfile, restoreProfile, softDeleteProfile, initials };
})();
