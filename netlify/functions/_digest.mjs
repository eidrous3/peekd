import crypto from 'crypto';
import { dbRequest, sendTicketEmail, serviceKey, siteUrl, supabaseUrl } from './_support.mjs';

const DIGEST_HOUR = 8;
const PER_TICK = 30;
const DEFAULT_TZ = 'America/New_York';
const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#0EA5E9', '#16A34A'];
const SEPARATOR = '~';

function secret() {
  return process.env.UNSUBSCRIBE_SECRET || serviceKey() || 'peekd-dev-unsubscribe-secret';
}

function sign(body) {
  return crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}

export function signDigestToken(userId) {
  const id = String(userId || '').trim();
  if (!id) return '';
  const body = Buffer.from(JSON.stringify({ u: id, k: 'digest' })).toString('base64url');
  return `${body}${SEPARATOR}${sign(body)}`;
}

export function verifyDigestToken(token) {
  const raw = String(token || '').trim();
  if (!raw.includes(SEPARATOR)) return null;
  const [body, provided] = raw.split(SEPARATOR);
  if (!body || !provided) return null;
  const expected = sign(body);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.k !== 'digest' || !payload.u) return null;
    return { userId: String(payload.u) };
  } catch {
    return null;
  }
}

export function digestUnsubscribeUrl(userId) {
  const token = signDigestToken(userId);
  if (!token) return '';
  return `${siteUrl()}/d/${encodeURIComponent(token)}`;
}

export function dashboardUrl(query = '') {
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  return `${siteUrl()}/Peekd%20Dashboard.html${q}`;
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validTimeZone(tz) {
  const zone = String(tz || '').trim();
  if (!zone) return DEFAULT_TZ;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return DEFAULT_TZ;
  }
}

function localParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const g = (type) => parts.find((p) => p.type === type)?.value;
  return {
    ymd: `${g('year')}-${g('month')}-${g('day')}`,
    hour: Number(g('hour')),
  };
}

function addDaysYmd(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function localOffsetMs(instant, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const g = (type) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return asUtc - instant.getTime();
}

function wallTimeToUtc(ymd, hour, minute, second, tz) {
  const [y, m, d] = ymd.split('-').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hour, minute, second);
  let instant = utcGuess;
  for (let i = 0; i < 3; i += 1) {
    instant = utcGuess - localOffsetMs(new Date(instant), tz);
  }
  return new Date(instant);
}

export function localDayBounds(ymd, tz) {
  const zone = validTimeZone(tz);
  const start = wallTimeToUtc(ymd, 0, 0, 0, zone);
  const next = addDaysYmd(ymd, 1);
  const end = new Date(wallTimeToUtc(next, 0, 0, 0, zone).getTime() - 1);
  return { start, end };
}

function formatLongDate(ymd, tz) {
  const { start } = localDayBounds(ymd, tz);
  return start.toLocaleDateString('en-US', {
    timeZone: validTimeZone(tz),
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function firstName(profileName, email) {
  const fromProfile = String(profileName || '').trim().split(/\s+/)[0];
  if (fromProfile) return fromProfile;
  const local = normalizeEmail(email).split('@')[0] || 'there';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function initials(name, email) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (normalizeEmail(email).slice(0, 2) || '?').toUpperCase();
}

function displayName(email) {
  const local = normalizeEmail(email).split('@')[0] || 'Recipient';
  return local.split(/[._-]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || local;
}

function inWindow(iso, start, end) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime();
}

function postgrestIn(ids) {
  return `(${ids.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',')})`;
}

async function fetchUserEmail(userId) {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key || !userId) return '';
  const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return '';
  const data = await res.json().catch(() => ({}));
  return normalizeEmail(data?.email || data?.user?.email);
}

export async function disableDigest(userId) {
  if (!userId) return { ok: false, error: 'user_required' };
  const res = await dbRequest(
    `notification_settings?id=eq.${encodeURIComponent(userId)}`,
    { method: 'PATCH', body: { daily_digest_enabled: false }, prefer: 'return=minimal' },
  );
  if (!res.ok) return { ok: false, error: res.error || 'update_failed' };
  return { ok: true };
}

export async function digestStatus(userId) {
  const res = await dbRequest(
    `notification_settings?id=eq.${encodeURIComponent(userId)}&select=id,daily_digest_enabled`,
  );
  const row = Array.isArray(res.data) ? res.data[0] : null;
  return {
    ok: res.ok && !!row,
    enabled: row?.daily_digest_enabled === true,
  };
}

async function fetchYesterdayStats(userId, start, end) {
  const lookback = new Date(start.getTime() - 14 * 86_400_000).toISOString();
  const select = [
    'id',
    'sent_at',
    'subject',
    'tracked_recipients(id,email,is_replied,replied_at,email_open_events(opened_at,classification))',
    'tracked_links(original_url,email_click_events(clicked_at,classification))',
  ].join(',');

  const res = await dbRequest(
    `tracked_emails?user_id=eq.${encodeURIComponent(userId)}`
      + `&sent_at=gte.${encodeURIComponent(lookback)}`
      + `&select=${encodeURIComponent(select)}`
      + `&order=sent_at.desc`
      + `&limit=250`,
  );
  if (!res.ok || !Array.isArray(res.data)) {
    return { ok: false, error: res.error || 'fetch_failed' };
  }

  let sent = 0;
  let sentRecipients = 0;
  let openedRecipients = 0;
  let repliedRecipients = 0;
  let clicks = 0;
  const hotMap = new Map();

  for (const email of res.data) {
    const sentYesterday = inWindow(email.sent_at, start, end);
    if (sentYesterday) sent += 1;

    for (const recip of email.tracked_recipients || []) {
      if (sentYesterday) {
        sentRecipients += 1;
        const human = (recip.email_open_events || []).filter((ev) => ev.classification === 'human');
        if (human.length) openedRecipients += 1;
        if (recip.is_replied) repliedRecipients += 1;
      }

      const yesterdayOpens = (recip.email_open_events || []).filter(
        (ev) => ev.classification === 'human' && inWindow(ev.opened_at, start, end),
      ).length;
      if (yesterdayOpens >= 2) {
        const addr = normalizeEmail(recip.email);
        if (!addr) continue;
        const cur = hotMap.get(addr) || { email: addr, opens: 0, subject: email.subject || '' };
        cur.opens += yesterdayOpens;
        if (email.subject) cur.subject = email.subject;
        hotMap.set(addr, cur);
      }
    }

    if (sentYesterday) {
      for (const link of email.tracked_links || []) {
        clicks += (link.email_click_events || []).filter(
          (ev) => ev.classification !== 'likely_proxy' && ev.classification !== 'self',
        ).length;
      }
    }
  }

  const openRate = sentRecipients > 0 ? Math.round((openedRecipients / sentRecipients) * 100) : null;
  const hot = [...hotMap.values()]
    .sort((a, b) => b.opens - a.opens)
    .slice(0, 3)
    .map((row, i) => {
      const name = displayName(row.email);
      return {
        ...row,
        name,
        initials: initials(name, row.email),
        color: AVATAR_COLORS[i % AVATAR_COLORS.length],
      };
    });

  return {
    ok: true,
    sent,
    sentRecipients,
    openedRecipients,
    repliedRecipients,
    openRate,
    clicks,
    hot,
  };
}

function metricDelta(current, prior) {
  if (prior == null || current == null) return '';
  const diff = current - prior;
  if (diff === 0) return '';
  const arrow = diff > 0 ? '&#9650;' : '&#9660;';
  const color = diff > 0 ? '#22C55E' : '#EF4444';
  const label = `${diff > 0 ? '+' : ''}${diff}`;
  return `<div style="font-family:Inter,system-ui,Arial,sans-serif;font-size:11px;font-weight:600;color:${color};margin-top:5px;">${arrow} ${label}</div>`;
}

function metricCard(value, label, deltaHtml, pad) {
  return `<td width="25%" valign="top" style="${pad}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFF;border:1px solid #E2E8F0;border-radius:10px;"><tr><td style="padding:14px 12px;text-align:center;">
      <div style="font-family:Inter,system-ui,Arial,sans-serif;font-size:28px;font-weight:800;color:#0F172A;line-height:1;letter-spacing:-0.02em;">${esc(value)}</div>
      <div style="font-family:Inter,system-ui,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.06em;color:#94A3B8;text-transform:uppercase;margin-top:7px;">${esc(label)}</div>
      ${deltaHtml || '<div style="height:16px;margin-top:5px;"></div>'}
    </td></tr></table>
  </td>`;
}

function buildDigestEmail({ name, email, yesterdayLabel, stats, prior, inboxUrl, settingsUrl, unsubUrl }) {
  const greeting = firstName(name, email);
  const sent = String(stats.sent);
  const open = stats.openRate == null ? '—' : `${stats.openRate}%`;
  const replies = String(stats.repliedRecipients);
  const clicks = String(stats.clicks);
  const preview = stats.sent === 0 && stats.repliedRecipients === 0
    ? `Your Peekd digest for ${yesterdayLabel}`
    : `${open === '—' ? sent + ' emails sent' : open + ' open rate'} yesterday · ${replies} ${Number(replies) === 1 ? 'reply' : 'replies'}`;

  const hotRows = (stats.hot || []).map((p) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;border:1px solid #E2E8F0;border-left:3px solid #3B82F6;border-radius:10px;margin-bottom:10px;">
  <tr><td style="padding:14px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="44" valign="top">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="36" height="36" align="center" valign="middle" style="width:36px;height:36px;background-color:${p.color};border-radius:50%;font-family:Inter,system-ui,Arial,sans-serif;font-size:13px;font-weight:700;color:#FFFFFF;">${esc(p.initials)}</td></tr></table>
      </td>
      <td valign="top" style="padding-left:8px;">
        <p style="margin:0;font-size:14.5px;font-weight:700;color:#0F172A;line-height:1.3;">${esc(p.name)}</p>
        <p style="margin:2px 0 0 0;font-size:12.5px;color:#64748B;line-height:1.4;">${esc(p.email)}</p>
      </td>
      <td valign="top" align="right" style="white-space:nowrap;">
        <p style="margin:0;font-size:13.5px;font-weight:700;color:#0F172A;line-height:1.3;">Opened ${p.opens}×</p>
        <p style="margin:2px 0 0 0;font-size:12px;color:#64748B;line-height:1.4;">${esc(p.subject || '')}</p>
      </td>
    </tr></table>
  </td></tr>
  </table>`).join('');

  const hotSection = stats.hot?.length
    ? `<tr>
<td style="padding:30px 40px 0 40px;font-family:Inter,system-ui,-apple-system,Arial,sans-serif;">
  <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.09em;color:#94A3B8;text-transform:uppercase;">Hot right now</p>
  <p style="margin:0 0 14px 0;font-size:13px;line-height:1.55;color:#64748B;">People who opened your emails more than once yesterday.</p>
  ${hotRows}
</td>
</tr>`
    : '';

  const emptyNote = stats.sent === 0
    ? `<p style="margin:16px 0 0 0;font-size:13px;line-height:1.55;color:#64748B;">No tracked emails went out yesterday. We'll summarize the next day you send.</p>`
    : '';

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Peekd — Daily Digest</title>
</head>
<body style="margin:0;padding:0;background-color:#F8FAFF;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#F8FAFF;">${esc(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFF;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;">
<tr><td style="padding:34px 40px 0 40px;">
  <p style="margin:0;font-family:Inter,system-ui,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#0F172A;">Peekd</p>
</td></tr>
<tr><td style="padding:26px 40px 0 40px;font-family:Inter,system-ui,Arial,sans-serif;">
  <p style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A;letter-spacing:-0.02em;">Good morning, ${esc(greeting)}.</p>
  <p style="margin:8px 0 0 0;font-size:14px;line-height:1.55;color:#64748B;">Here's your email intelligence for <span style="color:#0F172A;font-weight:600;">${esc(yesterdayLabel)}</span>.</p>
</td></tr>
<tr><td style="padding:24px 40px 0 40px;"><div style="height:1px;background-color:#E2E8F0;">&nbsp;</div></td></tr>
<tr><td style="padding:26px 40px 0 40px;font-family:Inter,system-ui,Arial,sans-serif;">
  <p style="margin:0 0 14px 0;font-size:11px;font-weight:700;letter-spacing:0.09em;color:#94A3B8;text-transform:uppercase;">Yesterday at a glance</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    ${metricCard(sent, 'Sent', metricDelta(stats.sent, prior?.sent), 'padding-right:5px;')}
    ${metricCard(open, 'Open rate', metricDelta(stats.openRate, prior?.openRate), 'padding:0 2.5px;')}
    ${metricCard(replies, 'Replies', metricDelta(stats.repliedRecipients, prior?.repliedRecipients), 'padding:0 2.5px;')}
    ${metricCard(clicks, 'Link clicks', metricDelta(stats.clicks, prior?.clicks), 'padding-left:5px;')}
  </tr></table>
  ${emptyNote}
</td></tr>
${hotSection}
<tr><td style="padding:30px 40px 0 40px;"><div style="height:1px;background-color:#E2E8F0;">&nbsp;</div></td></tr>
<tr><td align="center" style="padding:24px 40px 26px 40px;">
  <a href="${esc(inboxUrl)}" style="display:inline-block;font-family:Inter,system-ui,Arial,sans-serif;font-size:14px;font-weight:600;color:#FFFFFF;background-color:#3B82F6;border-radius:10px;padding:13px 26px;text-decoration:none;">View full dashboard →</a>
</td></tr>
<tr><td align="center" style="padding:8px 40px 32px 40px;font-family:Inter,system-ui,Arial,sans-serif;">
  <p style="margin:0;font-size:12px;line-height:1.6;color:#94A3B8;">You're receiving this because daily digest is enabled.</p>
  <p style="margin:14px 0 0 0;font-size:12px;line-height:1.7;color:#94A3B8;">
    <a href="${esc(unsubUrl)}" style="color:#3B82F6;text-decoration:none;">Unsubscribe from digest</a>
    &nbsp;·&nbsp;
    <a href="${esc(settingsUrl)}" style="color:#3B82F6;text-decoration:none;">Manage notifications</a>
  </p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    `Good morning, ${greeting}.`,
    `Peekd digest for ${yesterdayLabel}`,
    '',
    `Sent: ${sent}`,
    `Open rate: ${open}`,
    `Replies: ${replies}`,
    `Link clicks: ${clicks}`,
    '',
    `Dashboard: ${inboxUrl}`,
    `Unsubscribe: ${unsubUrl}`,
  ].join('\n');

  return { html, text, preview };
}

async function loadDueUsers(now, limit) {
  const settingsRes = await dbRequest(
    'notification_settings?daily_digest_enabled=eq.true'
      + '&select=id,last_digest_sent_on,daily_digest_enabled'
      + '&order=last_digest_sent_on.asc.nullsfirst'
      + '&limit=400',
  );
  if (!settingsRes.ok) {
    if (/last_digest_sent_on/.test(settingsRes.error || '')) {
      return { ok: false, error: 'last_digest_sent_on missing — run supabase/migrations/20260815153000_add_last_digest_sent_on.sql' };
    }
    return { ok: false, error: settingsRes.error || 'settings_fetch_failed' };
  }

  const settings = Array.isArray(settingsRes.data) ? settingsRes.data : [];
  if (!settings.length) return { ok: true, users: [] };

  const ids = settings.map((row) => row.id).filter(Boolean);
  const profiles = new Map();
  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const profileRes = await dbRequest(
      `profiles?id=in.${postgrestIn(slice)}&is_deleted=eq.false&select=id,name,timezone`,
    );
    for (const row of Array.isArray(profileRes.data) ? profileRes.data : []) {
      profiles.set(row.id, row);
    }
  }

  const due = [];
  for (const row of settings) {
    const profile = profiles.get(row.id);
    if (!profile) continue;
    const tz = validTimeZone(profile.timezone);
    const { ymd, hour } = localParts(now, tz);
    if (hour < DIGEST_HOUR) continue;
    const sentOn = row.last_digest_sent_on ? String(row.last_digest_sent_on).slice(0, 10) : '';
    if (sentOn === ymd) continue;
    due.push({
      id: row.id,
      name: profile.name || '',
      timezone: tz,
      today: ymd,
      yesterday: addDaysYmd(ymd, -1),
    });
    if (due.length >= limit) break;
  }

  return { ok: true, users: due };
}

async function sendOneDigest(user) {
  const email = await fetchUserEmail(user.id);
  if (!email) return { ok: false, error: 'no_email' };

  const { start, end } = localDayBounds(user.yesterday, user.timezone);
  const priorYmd = addDaysYmd(user.yesterday, -1);
  const priorBounds = localDayBounds(priorYmd, user.timezone);

  const [stats, prior] = await Promise.all([
    fetchYesterdayStats(user.id, start, end),
    fetchYesterdayStats(user.id, priorBounds.start, priorBounds.end),
  ]);
  if (!stats.ok) return { ok: false, error: stats.error };

  const unsubUrl = digestUnsubscribeUrl(user.id);
  const yesterdayLabel = formatLongDate(user.yesterday, user.timezone);
  const built = buildDigestEmail({
    name: user.name,
    email,
    yesterdayLabel,
    stats,
    prior: prior.ok ? prior : null,
    inboxUrl: dashboardUrl(),
    settingsUrl: dashboardUrl('?settings=notifications'),
    unsubUrl,
  });

  const sent = await sendTicketEmail({
    to: email,
    subject: `Your Peekd digest — ${yesterdayLabel}`,
    html: built.html,
    text: built.text,
    headers: unsubUrl
      ? {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      }
      : undefined,
  });
  if (!sent.ok) return { ok: false, error: sent.error || 'send_failed' };

  const stamp = await dbRequest(
    `notification_settings?id=eq.${encodeURIComponent(user.id)}`,
    { method: 'PATCH', body: { last_digest_sent_on: user.today }, prefer: 'return=minimal' },
  );
  if (!stamp.ok) {
    console.error('[digest] sent but failed to stamp last_digest_sent_on', user.id, stamp.error);
  }

  return { ok: true, email };
}

/**
 * Send morning digests that are due at this instant. Safe to run every hour.
 */
export async function sendDueDigests({ now = new Date(), limit = PER_TICK } = {}) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return { ok: false, error: 'email_not_configured', scanned: 0, sent: 0, failed: 0 };
  }

  const loaded = await loadDueUsers(now, limit);
  if (!loaded.ok) return { ok: false, error: loaded.error, scanned: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const user of loaded.users) {
    const res = await sendOneDigest(user);
    if (res.ok) sent += 1;
    else {
      failed += 1;
      errors.push({ userId: user.id, error: res.error });
      console.error('[digest] send failed', user.id, res.error);
    }
  }

  return {
    ok: failed === 0,
    scanned: loaded.users.length,
    sent,
    failed,
    errors: errors.slice(0, 10),
  };
}
