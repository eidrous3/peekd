(function () {
  const DEFAULTS = {
    opens: true,
    links: true,
    reply: true,
    desktop: true,
    sound: false,
    mobile: true,
    digest: true,
  };

  const SELECT = 'id, email_opens_enabled, link_clicks_enabled, reply_read_enabled, desktop_enabled, sound_enabled, mobile_push_enabled, daily_digest_enabled';

  function fromRow(data) {
    if (!data) return { ...DEFAULTS };
    return {
      opens: !!data.email_opens_enabled,
      links: !!data.link_clicks_enabled,
      reply: !!data.reply_read_enabled,
      desktop: !!data.desktop_enabled,
      sound: !!data.sound_enabled,
      mobile: !!data.mobile_push_enabled,
      digest: !!data.daily_digest_enabled,
    };
  }

  function toRow(settings) {
    return {
      email_opens_enabled: !!settings.opens,
      link_clicks_enabled: !!settings.links,
      reply_read_enabled: !!settings.reply,
      desktop_enabled: !!settings.desktop,
      sound_enabled: !!settings.sound,
      mobile_push_enabled: !!settings.mobile,
      daily_digest_enabled: !!settings.digest,
    };
  }

  function settingsEqual(a, b) {
    if (!a || !b) return false;
    return Object.keys(DEFAULTS).every((k) => a[k] === b[k]);
  }

  async function fetchNotificationSettings() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return { ok: false, error: 'not_configured' };

    const session = await Auth.ensureSession();
    if (!session?.user) return { ok: false, error: 'no_session' };

    const sb = Auth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { data, error } = await sb
      .from('notification_settings')
      .select(SELECT)
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      settings: fromRow(data),
      id: session.user.id,
      fromDb: !!data,
    };
  }

  async function updateNotificationSettings(settings) {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return { ok: false, error: 'not_configured' };

    const session = await Auth.ensureSession();
    if (!session?.user) return { ok: false, error: 'no_session' };

    const sb = Auth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const payload = { id: session.user.id, ...toRow(settings) };
    const { data, error } = await sb
      .from('notification_settings')
      .upsert(payload, { onConflict: 'id' })
      .select(SELECT)
      .single();

    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      settings: fromRow(data),
      id: session.user.id,
    };
  }

  window.PeekdNotifications = {
    fetchNotificationSettings,
    updateNotificationSettings,
    DEFAULTS,
    fromRow,
    toRow,
    settingsEqual,
  };
})();
