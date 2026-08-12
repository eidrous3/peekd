import { dbRequest } from './_support.mjs';
import { resolveSendCredentials, sendTrackedEmail } from './_send-tracked.mjs';
import { syncRepliesForProvider } from './_providers.mjs';

const DUE_LIMIT = 25;
const SEND_CONCURRENCY = 4;

// Recipients in these states get no further steps.
const SKIP_STATUSES = new Set(['replied', 'paused', 'unsubscribed']);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

function postgrestInFilter(values) {
  return `(${values.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',')})`;
}

function sortSteps(steps) {
  return [...(steps || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
}

function currentStep(steps) {
  const sorted = sortSteps(steps);
  return sorted.find((s) => s.status !== 'sent' && s.status !== 'skipped') || null;
}

function addDaysToDate(base, days) {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + Math.max(0, Number(days) || 0));
  return d;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * Find past-due steps on active campaigns (capped per run).
 * Returns rows with nested campaign + all steps + recipients.
 */
export async function findDueCampaignSteps(now = new Date(), { limit = DUE_LIMIT } = {}) {
  const nowIso = now.toISOString();
  const campaignFields = (withUnsubscribe) => [
    'id',
    'user_id',
    'status',
    'from_email',
    ...(withUnsubscribe ? ['include_unsubscribe_link'] : []),
    'campaign_recipients(id,email,status,replied_at)',
    'campaign_steps(id,campaign_id,position,subject,body_html,delay_days,scheduled_at,sent_at,status)',
  ].join(',');

  const buildQuery = (withUnsubscribe) => {
    const select = [
      'id',
      'campaign_id',
      'position',
      'subject',
      'body_html',
      'delay_days',
      'scheduled_at',
      'sent_at',
      'status',
      `campaigns!inner(${campaignFields(withUnsubscribe)})`,
    ].join(',');

    return `campaign_steps`
      + `?status=in.(scheduled,pending)`
      + `&scheduled_at=not.is.null`
      + `&scheduled_at=lte.${encodeURIComponent(nowIso)}`
      + `&campaigns.status=eq.active`
      + `&select=${encodeURIComponent(select)}`
      + `&order=scheduled_at.asc`
      + `&limit=${Math.max(1, Math.min(100, Number(limit) || DUE_LIMIT))}`;
  };

  let res = await dbRequest(buildQuery(true));
  // Keep the cron alive if this deploy lands before the unsubscribe migration.
  if (!res.ok && /include_unsubscribe_link/.test(res.error || '')) {
    res = await dbRequest(buildQuery(false));
  }
  if (!res.ok) return { ok: false, error: res.error || 'fetch_failed', steps: [] };

  const rows = Array.isArray(res.data) ? res.data : [];
  const due = [];
  const seenCampaigns = new Set();

  for (const row of rows) {
    const campaign = row.campaigns;
    if (!campaign || String(campaign.status || '').toLowerCase() !== 'active') continue;
    if (seenCampaigns.has(campaign.id)) continue;

    const allSteps = sortSteps(campaign.campaign_steps || []);
    const current = currentStep(allSteps);
    if (!current || current.id !== row.id) continue;

    seenCampaigns.add(campaign.id);
    due.push({
      step: {
        id: row.id,
        campaign_id: row.campaign_id,
        position: row.position,
        subject: row.subject,
        body_html: row.body_html,
        delay_days: row.delay_days,
        scheduled_at: row.scheduled_at,
        sent_at: row.sent_at,
        status: row.status,
      },
      campaign: {
        id: campaign.id,
        user_id: campaign.user_id,
        status: campaign.status,
        from_email: campaign.from_email,
        include_unsubscribe_link: campaign.include_unsubscribe_link === true,
        campaign_recipients: campaign.campaign_recipients || [],
        campaign_steps: allSteps,
      },
    });
  }

  return { ok: true, steps: due };
}

async function syncCampaignReplies(campaign) {
  const campaignId = campaign.id;
  const userId = campaign.user_id;
  if (!campaignId || !userId) return;

  const select = [
    'id',
    'from_email',
    'provider',
    'gmail_message_id',
    'gmail_thread_id',
    'sent_at',
    'subject',
    'tracked_recipients(email,is_replied)',
  ].join(',');

  let trackedRes = await dbRequest(
    `tracked_emails?user_id=eq.${encodeURIComponent(userId)}`
      + `&campaign_id=eq.${encodeURIComponent(campaignId)}`
      + `&gmail_thread_id=not.is.null`
      + `&gmail_message_id=not.is.null`
      + `&select=${encodeURIComponent(select)}`
      + `&limit=200`,
  );

  // Migration may not be applied — fall back to subject match from sent steps.
  if (!trackedRes.ok && /campaign_id/.test(trackedRes.error || '')) {
    const subjects = (campaign.campaign_steps || [])
      .filter((s) => s.status === 'sent' && s.subject)
      .map((s) => String(s.subject).trim())
      .filter(Boolean);
    if (subjects.length) {
      trackedRes = await dbRequest(
        `tracked_emails?user_id=eq.${encodeURIComponent(userId)}`
          + `&subject=in.${postgrestInFilter(subjects)}`
          + `&gmail_thread_id=not.is.null`
          + `&gmail_message_id=not.is.null`
          + `&select=${encodeURIComponent(select)}`
          + `&limit=200`,
      );
    }
  }

  if (!trackedRes.ok || !Array.isArray(trackedRes.data) || !trackedRes.data.length) return;

  await syncRepliesForProvider(userId, trackedRes.data);

  const repliedEmails = new Set();
  for (const te of trackedRes.data) {
    for (const recip of te.tracked_recipients || []) {
      if (recip.is_replied) repliedEmails.add(normalizeEmail(recip.email));
    }
  }

  // Re-read tracked recipients after sync (flags may have flipped).
  const refreshed = await dbRequest(
    `tracked_emails?id=in.${postgrestInFilter(trackedRes.data.map((r) => r.id))}`
      + `&select=${encodeURIComponent('id,tracked_recipients(email,is_replied)')}`,
  );
  if (refreshed.ok && Array.isArray(refreshed.data)) {
    for (const te of refreshed.data) {
      for (const recip of te.tracked_recipients || []) {
        if (recip.is_replied) repliedEmails.add(normalizeEmail(recip.email));
      }
    }
  }

  if (!repliedEmails.size) return;

  // An unsubscribe is a stronger signal than a reply; don't overwrite it.
  const needUpdate = (campaign.campaign_recipients || []).filter((r) => {
    const email = normalizeEmail(r.email);
    return repliedEmails.has(email) && r.status !== 'replied' && r.status !== 'unsubscribed';
  });
  if (!needUpdate.length) return;

  const now = new Date().toISOString();
  await dbRequest(
    `campaign_recipients?campaign_id=eq.${encodeURIComponent(campaignId)}`
      + `&email=in.${postgrestInFilter(needUpdate.map((r) => normalizeEmail(r.email)))}`,
    {
      method: 'PATCH',
      body: { status: 'replied', replied_at: now },
      prefer: 'return=minimal',
    },
  );

  for (const r of campaign.campaign_recipients || []) {
    if (repliedEmails.has(normalizeEmail(r.email)) && r.status !== 'unsubscribed') {
      r.status = 'replied';
      r.replied_at = r.replied_at || now;
    }
  }
}

async function rechainLaterSteps(campaignId, steps, fromStep, sentAt) {
  let cursor = sentAt;
  for (const later of sortSteps(steps)) {
    if (later.position <= fromStep.position) continue;
    if (later.status === 'sent' || later.status === 'skipped') continue;
    const delay = Math.max(1, Number(later.delay_days) || 1);
    cursor = addDaysToDate(cursor, delay);
    await dbRequest(
      `campaign_steps?id=eq.${encodeURIComponent(later.id)}`
        + `&campaign_id=eq.${encodeURIComponent(campaignId)}`,
      {
        method: 'PATCH',
        body: {
          scheduled_at: cursor.toISOString(),
          status: later.status === 'pending' ? 'scheduled' : later.status,
        },
        prefer: 'return=minimal',
      },
    );
  }
}

/**
 * Publish one due step (pause-on-reply). Returns { ok, sentCount, skipped, error }.
 */
export async function publishCampaignStepServer({ campaign, step }) {
  if (!campaign?.id || !step?.id) return { ok: false, error: 'invalid_input' };
  if (String(campaign.status || '').toLowerCase() !== 'active') {
    return { ok: false, error: 'campaign_paused', skipped: true };
  }

  // Fresh status check (idempotency against overlapping cron / manual publish).
  const fresh = await dbRequest(
    `campaign_steps?id=eq.${encodeURIComponent(step.id)}&select=id,status,position`,
  );
  const freshStep = fresh.ok && fresh.data?.[0];
  if (!freshStep) return { ok: false, error: 'step_not_found' };
  if (freshStep.status === 'sent' || freshStep.status === 'skipped') {
    return { ok: false, error: 'already_sent', skipped: true };
  }

  await syncCampaignReplies(campaign);

  const toEmails = [...new Set((campaign.campaign_recipients || [])
    .filter((r) => !SKIP_STATUSES.has(r.status))
    .map((r) => normalizeEmail(r.email))
    .filter(isEmail))];

  if (!toEmails.length) {
    // No active recipients — skip this + later steps and finish the campaign.
    const skipIds = sortSteps(campaign.campaign_steps)
      .filter((row) => row.position >= step.position && row.status !== 'sent' && row.status !== 'skipped')
      .map((row) => row.id);

    if (skipIds.length) {
      await dbRequest(
        `campaign_steps?campaign_id=eq.${encodeURIComponent(campaign.id)}`
          + `&id=in.${postgrestInFilter(skipIds)}`,
        {
          method: 'PATCH',
          body: { status: 'skipped' },
          prefer: 'return=minimal',
        },
      );
    }

    await dbRequest(
      `campaigns?id=eq.${encodeURIComponent(campaign.id)}`,
      {
        method: 'PATCH',
        body: { status: 'completed' },
        prefer: 'return=minimal',
      },
    );

    console.log(
      `[campaigns] finished campaign ${campaign.id}: no recipients for step ${step.id}`,
    );
    return { ok: true, sentCount: 0, finished: true };
  }

  const fromEmail = normalizeEmail(campaign.from_email);
  if (!fromEmail) return { ok: false, error: 'from_required' };

  const tokenRes = await resolveSendCredentials(campaign.user_id, fromEmail);
  if (!tokenRes.ok) return { ok: false, error: tokenRes.error, skipped: true };

  // Re-check status immediately before sending.
  const again = await dbRequest(
    `campaign_steps?id=eq.${encodeURIComponent(step.id)}&select=status`,
  );
  if (again.ok && again.data?.[0]?.status === 'sent') {
    return { ok: false, error: 'already_sent', skipped: true };
  }

  const results = await mapPool(toEmails, SEND_CONCURRENCY, (email) => sendTrackedEmail({
    userId: campaign.user_id,
    accessToken: tokenRes.accessToken,
    fromEmail,
    to: [email],
    subject: step.subject || '',
    html: step.body_html || '',
    track: true,
    trackLinks: true,
    campaignId: campaign.id,
    campaignStepId: step.id,
    provider: tokenRes.provider,
    unsubscribeEnabled: campaign.include_unsubscribe_link === true,
  }).catch((err) => ({ ok: false, error: err?.message || 'send_failed' })));

  const sentCount = results.filter((r) => r && r.ok).length;
  if (!sentCount) return { ok: false, error: 'send_failed' };

  const sentAt = new Date();
  const mark = await dbRequest(
    `campaign_steps?id=eq.${encodeURIComponent(step.id)}`
      + `&campaign_id=eq.${encodeURIComponent(campaign.id)}`
      + `&status=in.(scheduled,pending)`,
    {
      method: 'PATCH',
      body: { status: 'sent', sent_at: sentAt.toISOString() },
      prefer: 'return=representation',
    },
  );

  if (!mark.ok || !mark.data?.length) {
    // Another worker may have claimed it; emails already went out.
    console.warn('[campaigns] step mark sent raced or failed:', step.id, mark.error);
  }

  await rechainLaterSteps(campaign.id, campaign.campaign_steps, step, sentAt);

  return { ok: true, sentCount };
}

/**
 * Process all due steps for this cron tick (sequential per campaign).
 */
export async function publishDueCampaignSteps({ now = new Date(), limit = DUE_LIMIT } = {}) {
  const found = await findDueCampaignSteps(now, { limit });
  if (!found.ok) {
    return {
      ok: false,
      error: found.error,
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: [found.error],
    };
  }

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let finished = 0;
  const errors = [];

  for (const item of found.steps) {
    processed += 1;
    try {
      const res = await publishCampaignStepServer(item);
      if (res.ok && res.finished) {
        finished += 1;
        console.log(
          `[campaigns] finished campaign ${item.campaign.id} (step ${item.step.id} skipped — no recipients)`,
        );
      } else if (res.ok) {
        sent += 1;
        console.log(
          `[campaigns] published step ${item.step.id} campaign ${item.campaign.id} → ${res.sentCount} emails`,
        );
      } else if (res.skipped) {
        skipped += 1;
        console.log(
          `[campaigns] skipped step ${item.step.id}: ${res.error}`,
        );
      } else {
        errors.push({ stepId: item.step.id, campaignId: item.campaign.id, error: res.error });
        console.error(`[campaigns] failed step ${item.step.id}:`, res.error);
      }
    } catch (err) {
      const message = err?.message || String(err);
      errors.push({ stepId: item.step.id, campaignId: item.campaign.id, error: message });
      console.error(`[campaigns] exception step ${item.step.id}:`, message);
    }
  }

  return {
    ok: true,
    processed,
    sent,
    skipped,
    finished,
    errors,
    dueFound: found.steps.length,
  };
}
