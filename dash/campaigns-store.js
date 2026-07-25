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

  function toUiCampaign(row, openStats) {
    const steps = sortSteps(row.campaign_steps);
    const recipients = Array.isArray(row.campaign_recipients) ? row.campaign_recipients : [];
    const stats = openStats || { sent: 0, opened: 0, openRate: 0, replies: 0, byStep: {} };
    const repliesFromRecipients = recipients.filter((r) => r.status === 'replied' || r.replied_at).length;
    const replies = Math.max(stats.replies || 0, repliesFromRecipients);
    return {
      id: row.id,
      name: row.name || 'Untitled campaign',
      status: statusToUi(row.status),
      created: formatCreated(row.created_at),
      createdAt: row.created_at,
      step: currentStepNumber(steps),
      steps: steps.length,
      recipients: recipients.length,
      openRate: stats.openRate,
      emailsSent: stats.sent,
      emailsOpened: stats.opened,
      replies,
      fromEmail: row.from_email || '',
      sourceListId: row.source_list_id || null,
      timezone: row.timezone || 'UTC',
      stepRows: steps.map((s) => {
        const stepStat = stats.byStep[s.id] || { sent: 0, opened: 0, openRate: null };
        return {
          id: s.id,
          n: s.position,
          subject: s.subject || '',
          bodyHtml: s.body_html || '',
          wait: s.position === 1 ? null : (s.delay_days || 0),
          delayDays: s.delay_days || 0,
          scheduledAt: s.scheduled_at || null,
          sentAt: s.sent_at || null,
          status: s.status || 'pending',
          openRate: s.status === 'sent' ? (stepStat.openRate == null ? 0 : stepStat.openRate) : null,
          state: s.status === 'sent' ? 'completed'
            : s.status === 'skipped' ? 'pending'
              : (statusToUi(row.status) === 'PAUSED' && s.status !== 'sent' ? 'paused'
                : (s.status === 'scheduled' || s.status === 'pending' ? (currentStepNumber(steps) === s.position ? 'active' : 'pending') : 'pending')),
        };
      }),
      recipientRows: recipients.map((r) => ({
        id: r.id,
        email: r.email,
        personId: r.person_id || null,
        status: String(r.status || 'active').toUpperCase(),
        repliedAt: r.replied_at || null,
      })),
    };
  }

  function hasHumanOpen(events) {
    return (events || []).some((ev) => ev.classification === 'human');
  }

  // Open/reply stats for steps already sent (excludes future steps).
  // Open rate = unique recipients who opened ANY sent step / unique recipients the campaign was sent to.
  // Replies = unique campaign recipients who replied to at least one sent step.
  function openStatsFromTracked(campaignRows, trackedEmails) {
    const byCampaign = new Map();
    for (const camp of campaignRows || []) {
      const sentSteps = sortSteps(camp.campaign_steps).filter((s) => s.status === 'sent');
      const recipSet = new Set((camp.campaign_recipients || []).map((r) => normalizeEmail(r.email)).filter(Boolean));
      const sentSubjects = new Set(sentSteps.map((s) => String(s.subject || '').trim()).filter(Boolean));
      const stepIds = new Set(sentSteps.map((s) => s.id));
      const createdMs = camp.created_at ? new Date(camp.created_at).getTime() - 60_000 : 0;

      const contactedEmails = new Set();
      const openedEmails = new Set();
      const repliedEmails = new Set();
      const byStep = {};
      for (const step of sentSteps) byStep[step.id] = { sent: 0, opened: 0, openRate: 0 };

      for (const te of trackedEmails || []) {
        const linked = te.campaign_id === camp.id
          || (te.campaign_step_id && stepIds.has(te.campaign_step_id));
        const subjectMatch = sentSubjects.has(String(te.subject || '').trim());
        const sentAtMs = te.sent_at ? new Date(te.sent_at).getTime() : 0;
        const fallback = !te.campaign_id && !te.campaign_step_id
          && subjectMatch
          && sentAtMs >= createdMs;
        if (!linked && !fallback) continue;

        const stepId = te.campaign_step_id && stepIds.has(te.campaign_step_id)
          ? te.campaign_step_id
          : (sentSteps.find((s) => s.subject === te.subject)?.id || null);

        for (const recip of te.tracked_recipients || []) {
          const email = normalizeEmail(recip.email);
          if (!recipSet.has(email)) continue;
          contactedEmails.add(email);
          const didOpen = hasHumanOpen(recip.email_open_events);
          if (didOpen) openedEmails.add(email);
          if (recip.is_replied) repliedEmails.add(email);
          if (stepId && byStep[stepId]) {
            byStep[stepId].sent += 1;
            if (didOpen) byStep[stepId].opened += 1;
          }
        }
      }

      for (const id of Object.keys(byStep)) {
        const s = byStep[id];
        s.openRate = s.sent > 0 ? Math.round((s.opened / s.sent) * 100) : 0;
      }

      const contacted = contactedEmails.size;
      byCampaign.set(camp.id, {
        sent: contacted,
        opened: openedEmails.size,
        openRate: contacted > 0 ? Math.round((openedEmails.size / contacted) * 100) : 0,
        replies: repliedEmails.size,
        repliedEmails: [...repliedEmails],
        byStep,
      });
    }
    return byCampaign;
  }

  async function fetchTrackedForCampaigns(sb, userId, campaigns) {
    if (!campaigns?.length) return [];
    const campaignIds = campaigns.map((c) => c.id).filter(Boolean);
    const subjects = [];
    for (const c of campaigns) {
      for (const s of c.campaign_steps || []) {
        if (s.status === 'sent' && s.subject) subjects.push(String(s.subject).trim());
      }
    }
    const uniqueSubjects = [...new Set(subjects.filter(Boolean))];
    const baseSelect = 'id, subject, from_email, sent_at, tracked_recipients(email, is_replied, replied_at, email_open_events(classification))';
    const linkedSelect = 'id, subject, from_email, sent_at, campaign_id, campaign_step_id, tracked_recipients(email, is_replied, replied_at, email_open_events(classification))';
    const byId = new Map();

    if (campaignIds.length) {
      const linked = await sb
        .from('tracked_emails')
        .select(linkedSelect)
        .eq('user_id', userId)
        .in('campaign_id', campaignIds);
      if (!linked.error) {
        for (const row of linked.data || []) byId.set(row.id, row);
      }
    }

    if (uniqueSubjects.length) {
      const bySubject = await sb
        .from('tracked_emails')
        .select(baseSelect)
        .eq('user_id', userId)
        .in('subject', uniqueSubjects);
      if (!bySubject.error) {
        for (const row of bySubject.data || []) {
          if (!byId.has(row.id)) byId.set(row.id, row);
        }
      }
    }

    return [...byId.values()];
  }

  function addDaysToDate(base, days) {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + Math.max(0, Number(days) || 0));
    return d;
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

    const rows = data || [];
    const tracked = await fetchTrackedForCampaigns(sb, s.user.id, rows);
    const openByCampaign = openStatsFromTracked(rows, tracked);

    // Persist reply flags onto campaign_recipients when tracked sends show is_replied.
    await Promise.all(rows.map(async (camp) => {
      const stats = openByCampaign.get(camp.id);
      if (!stats?.repliedEmails?.length) return;
      const needUpdate = (camp.campaign_recipients || []).filter((r) => {
        const email = normalizeEmail(r.email);
        return stats.repliedEmails.includes(email) && !r.replied_at && r.status !== 'replied';
      });
      if (!needUpdate.length) return;
      const now = new Date().toISOString();
      await sb
        .from('campaign_recipients')
        .update({ status: 'replied', replied_at: now })
        .eq('campaign_id', camp.id)
        .in('email', needUpdate.map((r) => normalizeEmail(r.email)));
      for (const r of camp.campaign_recipients || []) {
        if (stats.repliedEmails.includes(normalizeEmail(r.email))) {
          r.status = 'replied';
          r.replied_at = r.replied_at || now;
        }
      }
    }));

    return {
      ok: true,
      campaigns: rows.map((row) => toUiCampaign(row, openByCampaign.get(row.id))),
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
    const immediatePositions = new Set();
    // Cursor starts at client "now"; each follow-up adds its delay onto the prior step's send time.
    let scheduleCursor = new Date();
    for (let i = 0; i < stepsIn.length; i++) {
      const step = stepsIn[i];
      const position = i + 1;
      // Only step 1 may send immediately; follow-ups always wait N days after the previous step.
      const isAfter = position > 1 || step.timing === 'after' || step.timing === 'wait';
      const afterDays = isAfter ? Math.max(position > 1 ? 1 : 0, parseInt(step.days, 10) || 0) : 0;
      let scheduledAt = null;
      let status = 'pending';

      if (isAfter) {
        scheduleCursor = addDaysToDate(scheduleCursor, afterDays);
        scheduledAt = scheduleCursor.toISOString();
        status = 'scheduled';
      } else {
        immediatePositions.add(position);
        scheduleCursor = new Date();
        scheduledAt = scheduleCursor.toISOString();
        status = 'scheduled';
      }

      stepRows.push({
        campaign_id: campaign.id,
        position,
        subject: String(step.subject || '').trim(),
        body_html: String(step.message || step.bodyHtml || step.body_html || ''),
        delay_days: afterDays,
        scheduled_at: scheduledAt,
        status,
      });
    }

    const { data: insertedSteps, error: stepsErr } = await sb
      .from('campaign_steps')
      .insert(stepRows)
      .select(STEP_COLUMNS);
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

    // Immediate steps go out right now via Gmail with the tracking pixel.
    if (immediatePositions.size && fromEmail && window.PeekdGmail?.sendEmail) {
      const toEmails = recipientRows.map((r) => r.email);
      const sentStepIds = [];
      for (const row of sortSteps(insertedSteps)) {
        if (!immediatePositions.has(row.position)) continue;
        const results = await Promise.all(toEmails.map((email) => window.PeekdGmail.sendEmail({
          fromEmail,
          to: [email],
          subject: row.subject,
          html: row.body_html,
          trackLinks: true,
          campaignId: campaign.id,
          campaignStepId: row.id,
        }).catch(() => ({ ok: false }))));
        if (results.some((r) => r && r.ok)) sentStepIds.push(row.id);
      }
      if (sentStepIds.length) {
        await sb
          .from('campaign_steps')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .in('id', sentStepIds)
          .eq('campaign_id', campaign.id);
      }
    }

    const { data: full, error: fetchErr } = await sb
      .from('campaigns')
      .select(FETCH_SELECT)
      .eq('id', campaign.id)
      .eq('user_id', s.user.id)
      .single();

    if (fetchErr) {
      return { ok: true, campaign: toUiCampaign({ ...campaign, campaign_steps: stepRows, campaign_recipients: recipientRows }) };
    }
    const tracked = await fetchTrackedForCampaigns(sb, s.user.id, [full]);
    const openByCampaign = openStatsFromTracked([full], tracked);
    return { ok: true, campaign: toUiCampaign(full, openByCampaign.get(full.id)) };
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
        return { subject: s.subject, message: s.body_html, timing: 'after', days: delayDays };
      }
      return { subject: s.subject, message: s.body_html, timing: 'now', days: 3 };
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

  async function publishCampaignStep(campaignId, stepId) {
    if (!campaignId || !stepId) return { ok: false, error: 'invalid_input' };
    if (!window.PeekdGmail?.sendEmail) return { ok: false, error: 'gmail_unavailable' };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { data, error } = await sb
      .from('campaigns')
      .select(FETCH_SELECT)
      .eq('id', campaignId)
      .eq('user_id', s.user.id)
      .single();

    if (error || !data) return { ok: false, error: error?.message || 'not_found' };
    if (String(data.status || '').toLowerCase() === 'paused') {
      return { ok: false, error: 'campaign_paused' };
    }

    const steps = sortSteps(data.campaign_steps);
    const step = steps.find((row) => row.id === stepId);
    if (!step) return { ok: false, error: 'step_not_found' };
    if (step.status === 'sent') return { ok: false, error: 'already_sent' };

    const currentPos = currentStepNumber(steps);
    if (step.position !== currentPos) return { ok: false, error: 'not_current_step' };

    const fromEmail = normalizeEmail(data.from_email);
    if (!fromEmail) return { ok: false, error: 'from_required' };

    const toEmails = (data.campaign_recipients || [])
      .filter((r) => r.status !== 'replied' && r.status !== 'paused')
      .map((r) => normalizeEmail(r.email))
      .filter(isEmail);

    if (!toEmails.length) return { ok: false, error: 'recipients_required' };

    const results = await Promise.all(toEmails.map((email) => window.PeekdGmail.sendEmail({
      fromEmail,
      to: [email],
      subject: step.subject || '',
      html: step.body_html || '',
      trackLinks: true,
      campaignId,
      campaignStepId: step.id,
    }).catch(() => ({ ok: false }))));

    const sentCount = results.filter((r) => r && r.ok).length;
    if (!sentCount) return { ok: false, error: 'send_failed' };

    const sentAt = new Date();
    const { error: stepErr } = await sb
      .from('campaign_steps')
      .update({ status: 'sent', sent_at: sentAt.toISOString() })
      .eq('id', step.id)
      .eq('campaign_id', campaignId);

    if (stepErr) return { ok: false, error: stepErr.message };

    // Re-chain later steps from this send time (N days after previous step).
    let cursor = sentAt;
    for (const later of steps) {
      if (later.position <= step.position) continue;
      if (later.status === 'sent' || later.status === 'skipped') continue;
      const delay = Math.max(1, Number(later.delay_days) || 1);
      cursor = addDaysToDate(cursor, delay);
      await sb
        .from('campaign_steps')
        .update({
          scheduled_at: cursor.toISOString(),
          status: later.status === 'pending' ? 'scheduled' : later.status,
        })
        .eq('id', later.id)
        .eq('campaign_id', campaignId);
    }

    const { data: full, error: fetchErr } = await sb
      .from('campaigns')
      .select(FETCH_SELECT)
      .eq('id', campaignId)
      .eq('user_id', s.user.id)
      .single();

    if (fetchErr || !full) {
      return { ok: true, sentCount, campaign: toUiCampaign(data) };
    }
    const tracked = await fetchTrackedForCampaigns(sb, s.user.id, [full]);
    const openByCampaign = openStatsFromTracked([full], tracked);
    return { ok: true, sentCount, campaign: toUiCampaign(full, openByCampaign.get(full.id)) };
  }

  window.PeekdCampaigns = {
    fetchCampaigns,
    createCampaign,
    updateCampaignStatus,
    renameCampaign,
    deleteCampaign,
    duplicateCampaign,
    publishCampaignStep,
    clientTimezone,
    isEmail,
  };
})();
