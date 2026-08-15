(function () {
  const PLANS = ['free', 'premium'];
  const COLUMNS = 'id, name, timezone, plan, paddle_customer_id, is_deleted';

  function normalizePlan(value) {
    const plan = String(value || '').trim().toLowerCase();
    return PLANS.includes(plan) ? plan : 'free';
  }

  // The plan column ships in 20260814220000_add_profile_plan.sql; without it every
  // profile read would fail, so fall back to a free plan and say so once.
  let warnedMissingPlan = false;
  let warnedMissingPaddle = false;
  function missingPaddleColumn(error) {
    const missing = error && /column .*paddle_customer_id.* does not exist/i.test(error.message || '');
    if (missing && !warnedMissingPaddle) {
      warnedMissingPaddle = true;
      console.warn('[Peekd] profiles.paddle_customer_id is missing. Run supabase/migrations/20260815180000_paddle_billing.sql');
    }
    return missing;
  }
  function missingPlanColumn(error) {
    const missing = error && /column .*plan.* does not exist/i.test(error.message || '');
    if (missing && !warnedMissingPlan) {
      warnedMissingPlan = true;
      console.warn('[Peekd] profiles.plan is missing. Run supabase/migrations/20260814220000_add_profile_plan.sql — everyone stays on the free plan until then.');
    }
    return missing;
  }

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

    let { data, error } = await sb
      .from('profiles')
      .select(COLUMNS)
      .eq('id', session.user.id)
      .maybeSingle();

    if (missingPaddleColumn(error)) {
      ({ data, error } = await sb
        .from('profiles')
        .select('id, name, timezone, plan, is_deleted')
        .eq('id', session.user.id)
        .maybeSingle());
    }
    if (missingPlanColumn(error)) {
      ({ data, error } = await sb
        .from('profiles')
        .select('id, name, timezone, is_deleted')
        .eq('id', session.user.id)
        .maybeSingle());
    }

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
        plan: normalizePlan(data?.plan),
        paddleCustomerId: data?.paddle_customer_id || '',
        initials: initials(name, email),
        isDeleted: !!data?.is_deleted,
      },
    };
  }

  /** Plan is billed through Paddle; the client cannot write it. */
  async function updatePlan() {
    return { ok: false, error: 'use_checkout' };
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

    let { data, error } = await sb
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select(COLUMNS)
      .single();

    if (missingPaddleColumn(error)) {
      ({ data, error } = await sb
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('id, name, timezone, plan, is_deleted')
        .single());
    }
    if (missingPlanColumn(error)) {
      ({ data, error } = await sb
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('id, name, timezone, is_deleted')
        .single());
    }

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
        plan: normalizePlan(data?.plan),
        paddleCustomerId: data?.paddle_customer_id || '',
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

  function displayProfile(profile) {
    if (!profile) return { name: '…', email: '…', initials: '…' };
    const name = (profile.name || '').trim();
    return {
      name: name || (profile.email || '').split('@')[0] || 'Account',
      email: profile.email || '',
      initials: profile.initials || initials(name, profile.email),
    };
  }

  window.PeekdProfile = { fetchProfile, updateProfile, updatePlan, restoreProfile, softDeleteProfile, initials, displayProfile };
})();
