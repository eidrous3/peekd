(function () {
  const DEFAULTS = {
    opens: true,
    links: true,
    reply: true,
    desktop: true,
    sound: false,
    email: false,
    mobile: true,
    digest: true,
    digestFrequency: 'daily',
  };

  const SELECT = 'id, email_opens_enabled, link_clicks_enabled, reply_read_enabled, desktop_enabled, sound_enabled, email_alerts_enabled, mobile_push_enabled, daily_digest_enabled, digest_frequency';
  const SELECT_NO_FREQ = 'id, email_opens_enabled, link_clicks_enabled, reply_read_enabled, desktop_enabled, sound_enabled, email_alerts_enabled, mobile_push_enabled, daily_digest_enabled';
  const SELECT_NO_EMAIL = 'id, email_opens_enabled, link_clicks_enabled, reply_read_enabled, desktop_enabled, sound_enabled, mobile_push_enabled, daily_digest_enabled';

  function missingEmailAlertsColumn(error) {
    return error && /column .*email_alerts_enabled.* does not exist/i.test(error.message || '');
  }

  function missingDigestFrequencyColumn(error) {
    return error && /column .*digest_frequency.* does not exist/i.test(error.message || '');
  }

  function normalizeFrequency(value) {
    return value === 'weekly' ? 'weekly' : 'daily';
  }

  function fromRow(data) {
    if (!data) return { ...DEFAULTS };
    return {
      opens: !!data.email_opens_enabled,
      links: !!data.link_clicks_enabled,
      reply: !!data.reply_read_enabled,
      desktop: !!data.desktop_enabled,
      sound: !!data.sound_enabled,
      email: !!data.email_alerts_enabled,
      mobile: !!data.mobile_push_enabled,
      digest: !!data.daily_digest_enabled,
      digestFrequency: normalizeFrequency(data.digest_frequency),
    };
  }

  function toRow(settings, { includeEmailAlerts = true, includeFrequency = true } = {}) {
    const row = {
      email_opens_enabled: !!settings.opens,
      link_clicks_enabled: !!settings.links,
      reply_read_enabled: !!settings.reply,
      desktop_enabled: !!settings.desktop,
      sound_enabled: !!settings.sound,
      mobile_push_enabled: !!settings.mobile,
      daily_digest_enabled: !!settings.digest,
    };
    if (includeEmailAlerts) row.email_alerts_enabled = !!settings.email;
    if (includeFrequency) row.digest_frequency = normalizeFrequency(settings.digestFrequency);
    return row;
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

    let { data, error } = await sb
      .from('notification_settings')
      .select(SELECT)
      .eq('id', session.user.id)
      .maybeSingle();

    if (missingDigestFrequencyColumn(error)) {
      ({ data, error } = await sb
        .from('notification_settings')
        .select(SELECT_NO_FREQ)
        .eq('id', session.user.id)
        .maybeSingle());
    }
    if (missingEmailAlertsColumn(error)) {
      ({ data, error } = await sb
        .from('notification_settings')
        .select(SELECT_NO_EMAIL)
        .eq('id', session.user.id)
        .maybeSingle());
    }

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
    let { data, error } = await sb
      .from('notification_settings')
      .upsert(payload, { onConflict: 'id' })
      .select(SELECT)
      .single();

    if (missingDigestFrequencyColumn(error)) {
      ({ data, error } = await sb
        .from('notification_settings')
        .upsert({ id: session.user.id, ...toRow(settings, { includeFrequency: false }) }, { onConflict: 'id' })
        .select(SELECT_NO_FREQ)
        .single());
    }
    if (missingEmailAlertsColumn(error)) {
      ({ data, error } = await sb
        .from('notification_settings')
        .upsert({ id: session.user.id, ...toRow(settings, { includeEmailAlerts: false, includeFrequency: false }) }, { onConflict: 'id' })
        .select(SELECT_NO_EMAIL)
        .single());
    }

    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      settings: fromRow(data),
      id: session.user.id,
    };
  }

  // ── Notification feed ──────────────────────────────────────────────────────
  // Derived from tracking data rather than stored: an open event is an "opened"
  // notification, a replied recipient is a "replied" one.

  const FEED_LIMIT = 50;

  function relativeTime(value) {
    const t = value ? new Date(value).getTime() : NaN;
    if (Number.isNaN(t)) return '';
    const ms = Date.now() - t;
    if (ms < 60_000) return 'Just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    if (ms < 172_800_000) return 'Yesterday';
    if (ms < 604_800_000) return `${Math.floor(ms / 86_400_000)} days ago`;
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function ordinal(n) {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return `${n}th`;
    if (n % 10 === 1) return `${n}st`;
    if (n % 10 === 2) return `${n}nd`;
    if (n % 10 === 3) return `${n}rd`;
    return `${n}th`;
  }

  function titleCase(s) {
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function isReplySubject(subject) {
    return /^\s*re\s*:/i.test(String(subject || ''));
  }

  function displayName(email, namesByEmail) {
    const known = namesByEmail.get(String(email || '').toLowerCase());
    if (known) return known;
    const local = String(email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim();
    return local ? titleCase(local) : (email || 'Someone');
  }

  async function fetchNamesByEmail(sb, userId) {
    const names = new Map();
    const { data } = await sb
      .from('people')
      .select('first_name, last_name, email')
      .eq('user_id', userId);

    for (const row of data || []) {
      const name = [row.first_name, row.last_name].map((p) => String(p || '').trim()).filter(Boolean).join(' ');
      if (name) names.set(String(row.email || '').toLowerCase(), name);
    }
    return names;
  }

  // Null when the column is missing, which reads as "nothing marked read yet".
  async function fetchReadAt(sb, userId) {
    const { data, error } = await sb
      .from('notification_settings')
      .select('notifications_read_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[Peekd] notification_settings.notifications_read_at is missing. Run supabase/migrations/20260813230000_add_notifications_read_at.sql — notifications will stay unread until then.');
      return null;
    }
    return data?.notifications_read_at || null;
  }

  // Keys read individually; empty when the table is missing.
  async function fetchReadKeys(sb, userId) {
    const { data, error } = await sb
      .from('notification_reads')
      .select('notification_key')
      .eq('user_id', userId);

    if (error) {
      console.warn('[Peekd] The notification_reads table is missing. Run supabase/migrations/20260813235000_create_notification_reads.sql — opened notifications will not stay read until then.');
      return new Set();
    }
    return new Set((data || []).map((r) => r.notification_key));
  }

  // Opens land in the DB from the pixel. Replies only land after a mailbox
  // sync. The first notification read must happen BEFORE this runs, so already
  // stored replies become the baseline and newly discovered ones can toast.
  let lastReplySync = 0;
  async function syncReplies() {
    if (Date.now() - lastReplySync < 20_000) return { ok: true, updated: 0, skipped: true };
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return { ok: false, updated: 0 };
    const session = await Auth.ensureSession();
    if (!session?.access_token) return { ok: false, updated: 0 };
    lastReplySync = Date.now();
    try {
      const res = await fetch('/.netlify/functions/sync-tracked-replies', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      return { ok: !!data.ok, updated: Number(data.updated) || 0 };
    } catch {
      lastReplySync = 0;
      return { ok: false, updated: 0 };
    }
  }

  async function fetchNotifications() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return { ok: false, error: 'not_configured', notifications: [] };

    const session = await Auth.ensureSession();
    if (!session?.user) return { ok: false, error: 'no_session', notifications: [] };

    const sb = Auth.client();
    if (!sb) return { ok: false, error: 'not_configured', notifications: [] };

    const { data, error } = await sb
      .from('tracked_recipients')
      .select('id, email, is_replied, replied_at, tracked_emails!inner(user_id, subject), email_open_events(id, opened_at, classification)')
      .eq('tracked_emails.user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(400);

    if (error) return { ok: false, error: error.message, notifications: [] };

    const { data: linkRows, error: linkError } = await sb
      .from('tracked_links')
      .select('id, original_url, tracked_emails!inner(user_id, subject), email_click_events(id, clicked_at, classification)')
      .eq('tracked_emails.user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (linkError) {
      console.warn('[Peekd] Could not load link-click notifications:', linkError.message);
    }

    const [namesByEmail, readAt, readKeys] = await Promise.all([
      fetchNamesByEmail(sb, session.user.id),
      fetchReadAt(sb, session.user.id),
      fetchReadKeys(sb, session.user.id),
    ]);
    const readCutoff = readAt ? new Date(readAt).getTime() : 0;
    const items = [];

    for (const recipient of data || []) {
      const subject = String(recipient.tracked_emails?.subject || '').trim() || '(no subject)';
      const who = displayName(recipient.email, namesByEmail);

      // Only human opens count, matching how open rate is calculated elsewhere.
      const opens = (recipient.email_open_events || [])
        .filter((e) => e.classification === 'human' && e.opened_at)
        .sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at));

      // One row per email showing its most recent open, rather than one per open.
      // Keying on the latest event id means a new open resurfaces it as unread.
      const latestOpen = opens[opens.length - 1];
      if (latestOpen) {
        const replyRead = isReplySubject(subject);
        items.push({
          id: 'open:' + latestOpen.id,
          type: replyRead ? 'reply' : 'open',
          who,
          text: `opened "${subject}"` + (opens.length > 1 ? ` · ${ordinal(opens.length)} time` : ''),
          at: latestOpen.opened_at,
        });
      }
    }

    for (const link of linkRows || []) {
      const subject = String(link.tracked_emails?.subject || '').trim() || '(no subject)';
      const clicks = (link.email_click_events || [])
        .filter((e) => e.classification !== 'likely_proxy' && e.classification !== 'self' && e.clicked_at)
        .sort((a, b) => new Date(a.clicked_at) - new Date(b.clicked_at));
      const latestClick = clicks[clicks.length - 1];
      if (!latestClick) continue;
      let host = '';
      try { host = new URL(link.original_url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
      items.push({
        id: 'click:' + latestClick.id,
        type: 'click',
        who: 'Someone',
        text: `clicked ${host ? host + ' ' : ''}in "${subject}"` + (clicks.length > 1 ? ` · ${clicks.length}×` : ''),
        at: latestClick.clicked_at,
      });
    }

    items.sort((a, b) => new Date(b.at) - new Date(a.at));

    const withRead = items.map((n) => ({
      ...n,
      time: relativeTime(n.at),
      unread: new Date(n.at).getTime() > readCutoff && !readKeys.has(n.id),
    }));

    return {
      ok: true,
      readAt,
      // Counted before truncating, so the bell badge is not capped by FEED_LIMIT.
      unreadCount: withRead.filter((n) => n.unread).length,
      notifications: withRead.slice(0, FEED_LIMIT),
    };
  }

  async function markNotificationRead(notificationId) {
    const key = String(notificationId || '').trim();
    if (!key) return { ok: false, error: 'invalid_input' };

    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return { ok: false, error: 'not_configured' };

    const session = await Auth.ensureSession();
    if (!session?.user) return { ok: false, error: 'no_session' };

    const sb = Auth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { error } = await sb
      .from('notification_reads')
      .upsert(
        { user_id: session.user.id, notification_key: key, read_at: new Date().toISOString() },
        { onConflict: 'user_id,notification_key' },
      );

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function markAllNotificationsRead() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return { ok: false, error: 'not_configured' };

    const session = await Auth.ensureSession();
    if (!session?.user) return { ok: false, error: 'no_session' };

    const sb = Auth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const readAt = new Date().toISOString();
    const { error } = await sb
      .from('notification_settings')
      .upsert({ id: session.user.id, notifications_read_at: readAt }, { onConflict: 'id' });

    if (error) return { ok: false, error: error.message };

    // The watermark now covers every existing row, so per-row reads are redundant.
    await sb.from('notification_reads').delete().eq('user_id', session.user.id);

    return { ok: true, readAt };
  }

  window.PeekdNotifications = {
    fetchNotificationSettings,
    updateNotificationSettings,
    fetchNotifications,
    syncReplies,
    markNotificationRead,
    markAllNotificationsRead,
    DEFAULTS,
    fromRow,
    toRow,
    settingsEqual,
  };
})();
