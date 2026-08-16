import { dbRequest, sendTicketEmail, serviceKey, siteUrl, supabaseUrl } from './_support.mjs';

const TYPE_PREF = {
  open: 'email_opens_enabled',
  click: 'link_clicks_enabled',
  reply: 'reply_read_enabled',
};

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

function dashboardUrl(query = '') {
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  return `${siteUrl()}/Peekd%20Dashboard.html${q}`;
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

function copyFor(type, who, subject) {
  const title = subject || '(no subject)';
  if (type === 'click') {
    return {
      headline: `${who} clicked a link`,
      line: `${who} clicked a link in “${title}”.`,
      subject: `${who} clicked a link in “${title}”`,
    };
  }
  if (type === 'reply') {
    return {
      headline: `${who} replied`,
      line: `${who} replied to “${title}”.`,
      subject: `${who} replied to “${title}”`,
    };
  }
  return {
    headline: `${who} opened your email`,
    line: `${who} opened “${title}”.`,
    subject: `${who} opened “${title}”`,
  };
}

function buildHtml({ headline, line, inboxUrl, settingsUrl }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F8FAFF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFF;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px;max-width:520px;background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;">
<tr><td style="padding:28px 32px 0 32px;font-family:Inter,system-ui,Arial,sans-serif;">
  <p style="margin:0;font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#0F172A;">Peekd</p>
</td></tr>
<tr><td style="padding:22px 32px 0 32px;font-family:Inter,system-ui,Arial,sans-serif;">
  <p style="margin:0;font-size:20px;line-height:1.35;font-weight:700;color:#0F172A;letter-spacing:-0.02em;">${esc(headline)}</p>
  <p style="margin:10px 0 0 0;font-size:14px;line-height:1.55;color:#64748B;">${esc(line)}</p>
</td></tr>
<tr><td align="center" style="padding:24px 32px 0 32px;">
  <a href="${esc(inboxUrl)}" style="display:inline-block;font-family:Inter,system-ui,Arial,sans-serif;font-size:14px;font-weight:600;color:#FFFFFF;background-color:#3B82F6;border-radius:10px;padding:12px 22px;text-decoration:none;">Open Peekd →</a>
</td></tr>
<tr><td align="center" style="padding:18px 32px 28px 32px;font-family:Inter,system-ui,Arial,sans-serif;">
  <p style="margin:0;font-size:12px;line-height:1.6;color:#94A3B8;">
    You’re receiving this because email alerts are on.
    <a href="${esc(settingsUrl)}" style="color:#3B82F6;text-decoration:none;">Manage notifications</a>
  </p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Email the Peekd user about a tracking event. No-ops when the channel is off,
 * Resend is missing, or the email_alerts_enabled column is not migrated yet.
 */
export async function notifyTrackingAlert({ userId, type, who, subject } = {}) {
  const id = String(userId || '').trim();
  const kind = String(type || '').trim();
  if (!id || !TYPE_PREF[kind]) return { ok: true, skipped: true };
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return { ok: false, error: 'email_not_configured' };
  }

  const settingsRes = await dbRequest(
    `notification_settings?id=eq.${encodeURIComponent(id)}`
      + '&select=id,email_alerts_enabled,email_opens_enabled,link_clicks_enabled,reply_read_enabled',
  );
  if (!settingsRes.ok) {
    if (/email_alerts_enabled/.test(settingsRes.error || '')) {
      return { ok: true, skipped: true, error: 'email_alerts_missing' };
    }
    return { ok: false, error: settingsRes.error || 'settings_failed' };
  }

  const row = Array.isArray(settingsRes.data) ? settingsRes.data[0] : null;
  if (!row?.email_alerts_enabled) return { ok: true, skipped: true };
  if (row[TYPE_PREF[kind]] === false) return { ok: true, skipped: true };

  const to = await fetchUserEmail(id);
  if (!to) return { ok: false, error: 'no_email' };

  const whoLabel = String(who || 'Someone').trim() || 'Someone';
  const copy = copyFor(kind, whoLabel, String(subject || '').trim());
  const inboxUrl = dashboardUrl();
  const settingsUrl = dashboardUrl('?settings=notifications');

  return sendTicketEmail({
    to,
    subject: copy.subject,
    html: buildHtml({ headline: copy.headline, line: copy.line, inboxUrl, settingsUrl }),
    text: `${copy.line}\n\n${inboxUrl}\n`,
  });
}
