(function () {
  const CAMPAIGN_COLUMNS = 'id, name, status, from_email, source_list_id, timezone, created_at, updated_at';
  const STEP_COLUMNS = 'id, campaign_id, position, subject, body_html, delay_days, scheduled_at, sent_at, status';
  const RECIPIENT_COLUMNS = 'id, campaign_id, email, person_id, status, replied_at';
  const FETCH_SELECT = CAMPAIGN_COLUMNS
    + ', campaign_steps(' + STEP_COLUMNS + ')'
    + ', campaign_recipients(' + RECIPIENT_COLUMNS + ')';

  async function session() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return null;
    return Auth.ensureSession();
  }

  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function clientTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }

  function formatCreated(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startThat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayDiff = Math.round((startToday - startThat) / 86_400_000);
    if (dayDiff === 0) return 'Today';
    if (dayDiff === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function statusToUi(status) {
    return String(status || 'active').toUpperCase();
  }

  function statusToDb(status) {
    return String(status || 'active').toLowerCase();
  }

  function sortSteps(steps) {
    return [...(steps || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  function currentStepNumber(steps) {
    const sorted = sortSteps(steps);
    if (!sorted.length) return 1;
    const idx = sorted.findIndex((s) => s.status !== 'sent' && s.status !== 'skipped');
    if (idx < 0) return sorted.length;
    return sorted[idx].position || idx + 1;
  }

  function toUiCampaign(row) {
    const steps = sortSteps(row.campaign_steps);
    const recipients = Array.isArray(row.campaign_recipients) ? row.campaign_recipients : [];
    const replies = recipients.filter((r) => r.status === 'replied').length;
    return {
      id: row.id,
      name: row.name || 'Untitled campaign',
      status: statusToUi(row.status),
      created: formatCreated(row.created_at),
      createdAt: row.created_at,
      step: currentStepNumber(steps),
      steps: steps.length,
      recipients: recipients.length,
      openRate: 0,
      replies,
      fromEmail: row.from_email || '',
      sourceListId: row.source_list_id || null,
      timezone: row.timezone || 'UTC',
      stepRows: steps.map((s) => ({
        id: s.id,
        n: s.position,
        subject: s.subject || '',
        bodyHtml: s.body_html || '',
        wait: s.position === 1 ? null : (s.delay_days || 0),
        delayDays: s.delay_days || 0,
        scheduledAt: s.scheduled_at || null,
        sentAt: s.sent_at || null,
        status: s.status || 'pending',
        state: s.status === 'sent' ? 'completed'
          : s.status === 'skipped' ? 'pending'
            : (statusToUi(row.status) === 'PAUSED' && s.status !== 'sent' ? 'paused'
              : (s.status === 'scheduled' || s.status === 'pending' ? (currentStepNumber(steps) === s.position ? 'active' : 'pending') : 'pending')),
      })),
      recipientRows: recipients.map((r) => ({
        id: r.id,
        email: r.email,
        personId: r.person_id || null,
        status: String(r.status || 'active').toUpperCase(),
        repliedAt: r.replied_at || null,
      })),
    };
  }

  function addDaysIso(base, days) {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString();
  }

  async function resolveRecipientRows(sb, userId, { emails, listId }) {
    const map = new Map();

    if (listId) {
      const { data, error } = await sb
        .from('people')
        .select('id, email')
        .eq('user_id', userId)
        .eq('list_id', listId);
      if (error) return { ok: false, error: error.message, rows: [] };
      for (const person of data || []) {
        const email = normalizeEmail(person.email);
        if (!isEmail(email)) continue;
        map.set(email, { email, person_id: person.id, status: 'active' });
      }
    }

    for (const raw of Array.isArray(emails) ? emails : []) {
      const email = normalizeEmail(raw);
      if (!isEmail(email) || map.has(email)) continue;
      map.set(email, { email, person_id: null, status: 'active' });
    }

    // Fill person_id for typed emails when they already exist in People.
    const missing = [...map.values()].filter((r) => !r.person_id).map((r) => r.email);
    if (missing.length) {
      const { data } = await sb
        .from('people')
        .select('id, email')
        .eq('user_id', userId)
        .in('email', missing);
      for (const person of data || []) {
        const email = normalizeEmail(person.email);
        const row = map.get(email);
        if (row) row.person_id = person.id;
      }
    }

    return { ok: true, rows: [...map.values()] };
  }

  async function fetchCampaigns() {
    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session', campaigns: [] };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured', campaigns: [] };

    const { data, error } = await sb
      .from('campaigns')
      .select(FETCH_SELECT)
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false });

    if (error) return { ok: false, error: error.message, campaigns: [] };

    return {
      ok: true,
      campaigns: (data || []).map(toUiCampaign),
    };
  }

  async function createCampaign(input) {
    const name = String(input?.name || '').trim() || 'Untitled campaign';
    const fromEmail = normalizeEmail(input?.fromEmail || input?.from_email || '');
    const timezone = String(input?.timezone || clientTimezone()).trim() || clientTimezone();
    const sourceListId = input?.sourceListId || input?.listId || null;
    const emails = input?.emails || [];
    const stepsIn = Array.isArray(input?.steps) ? input.steps : [];

    if (!stepsIn.length) return { ok: false, error: 'steps_required' };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const resolved = await resolveRecipientRows(sb, s.user.id, { emails, listId: sourceListId });
    if (!resolved.ok) return { ok: false, error: resolved.error };
    if (!resolved.rows.length) return { ok: false, error: 'recipients_required' };

    const now = new Date();
    const { data: campaign, error: campErr } = await sb
      .from('campaigns')
      .insert({
        user_id: s.user.id,
        name,
        status: 'active',
        from_email: fromEmail,
        source_list_id: sourceListId || null,
        timezone,
      })
      .select(CAMPAIGN_COLUMNS)
      .single();

    if (campErr) return { ok: false, error: campErr.message };

    const stepRows = [];
    for (let i = 0; i < stepsIn.length; i++) {
      const step = stepsIn[i];
      const position = i + 1;
      let delayDays = 0;
      let scheduledAt = null;
      let status = 'pending';

      if (step.timing === 'at') {
        const raw = step.at || step.scheduledAt || step.scheduled_at;
        const parsed = raw ? new Date(raw) : null;
        if (!parsed || Number.isNaN(parsed.getTime())) {
          await sb.from('campaigns').delete().eq('id', campaign.id).eq('user_id', s.user.id);
          return { ok: false, error: 'schedule_required' };
        }
        scheduledAt = parsed.toISOString();
        status = 'scheduled';
      } else if (step.timing === 'wait') {
        delayDays = Math.max(0, parseInt(step.days, 10) || 0);
        if (position === 1) {
          scheduledAt = delayDays === 0 ? now.toISOString() : addDaysIso(now, delayDays);
          status = 'scheduled';
        }
      } else if (position === 1) {
        scheduledAt = now.toISOString();
        status = 'scheduled';
      }

      stepRows.push({
        campaign_id: campaign.id,
        position,
        subject: String(step.subject || '').trim(),
        body_html: String(step.message || step.bodyHtml || step.body_html || ''),
        delay_days: delayDays,
        scheduled_at: scheduledAt,
        status,
      });
    }

    const { error: stepsErr } = await sb.from('campaign_steps').insert(stepRows);
    if (stepsErr) {
      await sb.from('campaigns').delete().eq('id', campaign.id).eq('user_id', s.user.id);
      return { ok: false, error: stepsErr.message };
    }

    const recipientRows = resolved.rows.map((r) => ({
      campaign_id: campaign.id,
      email: r.email,
      person_id: r.person_id,
      status: 'active',
    }));

    const { error: recipErr } = await sb.from('campaign_recipients').insert(recipientRows);
    if (recipErr) {
      await sb.from('campaigns').delete().eq('id', campaign.id).eq('user_id', s.user.id);
      return { ok: false, error: recipErr.message };
    }

    const { data: full, error: fetchErr } = await sb
      .from('campaigns')
      .select(FETCH_SELECT)
      .eq('id', campaign.id)
      .eq('user_id', s.user.id)
      .single();

    if (fetchErr) return { ok: true, campaign: toUiCampaign({ ...campaign, campaign_steps: stepRows, campaign_recipients: recipientRows }) };
    return { ok: true, campaign: toUiCampaign(full) };
  }

  async function updateCampaignStatus(id, status) {
    if (!id) return { ok: false, error: 'invalid_input' };
    const dbStatus = statusToDb(status);
    if (!['draft', 'active', 'paused', 'completed'].includes(dbStatus)) {
      return { ok: false, error: 'invalid_status' };
    }

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { data, error } = await sb
      .from('campaigns')
      .update({ status: dbStatus })
      .eq('id', id)
      .eq('user_id', s.user.id)
      .select(FETCH_SELECT)
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, campaign: toUiCampaign(data) };
  }

  async function renameCampaign(id, name) {
    const trimmed = String(name || '').trim();
    if (!id || !trimmed) return { ok: false, error: 'invalid_input' };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { data, error } = await sb
      .from('campaigns')
      .update({ name: trimmed })
      .eq('id', id)
      .eq('user_id', s.user.id)
      .select(FETCH_SELECT)
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, campaign: toUiCampaign(data) };
  }

  async function deleteCampaign(id) {
    if (!id) return { ok: false, error: 'invalid_input' };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { error } = await sb
      .from('campaigns')
      .delete()
      .eq('id', id)
      .eq('user_id', s.user.id);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function duplicateCampaign(id) {
    if (!id) return { ok: false, error: 'invalid_input' };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { data, error } = await sb
      .from('campaigns')
      .select(FETCH_SELECT)
      .eq('id', id)
      .eq('user_id', s.user.id)
      .single();

    if (error || !data) return { ok: false, error: error?.message || 'not_found' };

    const steps = sortSteps(data.campaign_steps).map((s) => {
      const delayDays = s.delay_days || 0;
      if (delayDays > 0) {
        return { subject: s.subject, message: s.body_html, timing: 'wait', days: delayDays, at: '' };
      }
      if (s.scheduled_at && !s.sent_at) {
        const t = new Date(s.scheduled_at).getTime();
        if (!Number.isNaN(t) && t > Date.now() + 60_000) {
          return {
            subject: s.subject,
            message: s.body_html,
            timing: 'at',
            days: 3,
            at: s.scheduled_at,
          };
        }
      }
      return { subject: s.subject, message: s.body_html, timing: 'now', days: 3, at: '' };
    });
    const emails = (data.campaign_recipients || []).map((r) => r.email);

    return createCampaign({
      name: (data.name || 'Untitled campaign') + ' (copy)',
      fromEmail: data.from_email,
      timezone: data.timezone || clientTimezone(),
      sourceListId: null,
      emails,
      steps,
    });
  }

  window.PeekdCampaigns = {
    fetchCampaigns,
    createCampaign,
    updateCampaignStatus,
    renameCampaign,
    deleteCampaign,
    duplicateCampaign,
    clientTimezone,
    isEmail,
  };
})();
