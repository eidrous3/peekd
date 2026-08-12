import crypto from 'crypto';
import { dbRequest, serviceKey, siteUrl } from './_support.mjs';

/**
 * Unsubscribe links are self-describing and tamper-proof: the campaign id and
 * recipient address travel in the URL, signed with an HMAC. Nothing is stored
 * per link, and editing the payload to unsubscribe somebody else invalidates
 * the signature.
 */

function secret() {
  return process.env.UNSUBSCRIBE_SECRET || serviceKey() || 'peekd-dev-unsubscribe-secret';
}

// `~` is URL-safe and absent from the base64url alphabet, so it splits cleanly.
// A `.` would make the path look like a file with an extension to static hosting.
const SEPARATOR = '~';

function sign(body) {
  return crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function signUnsubscribeToken({ campaignId, email }) {
  const address = normalizeEmail(email);
  if (!campaignId || !address) return '';

  const body = Buffer.from(JSON.stringify({ c: campaignId, e: address })).toString('base64url');
  return `${body}${SEPARATOR}${sign(body)}`;
}

export function verifyUnsubscribeToken(token) {
  const raw = String(token || '').trim();
  if (!raw.includes(SEPARATOR)) return null;

  const [body, provided] = raw.split(SEPARATOR);
  if (!body || !provided) return null;

  const expected = sign(body);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Lengths must match before timingSafeEqual, which throws on a mismatch.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const campaignId = String(payload.c || '');
    const email = normalizeEmail(payload.e);
    if (!campaignId || !email) return null;
    return { campaignId, email };
  } catch {
    return null;
  }
}

export function unsubscribeUrl(token) {
  return `${siteUrl()}/u/${encodeURIComponent(token)}`;
}

/**
 * Is the per-campaign flag on? Returns false when the column doesn't exist yet,
 * so sends keep working if this deploy lands before the migration.
 */
export async function campaignAllowsUnsubscribe(campaignId) {
  if (!campaignId) return false;

  const res = await dbRequest(
    `campaigns?id=eq.${encodeURIComponent(campaignId)}&select=include_unsubscribe_link`,
  );
  if (!res.ok) {
    if (!/include_unsubscribe_link/.test(res.error || '')) {
      console.error('[unsubscribe] flag lookup failed:', res.error);
    }
    return false;
  }
  return res.data?.[0]?.include_unsubscribe_link === true;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Append the footer. Must run after link tracking so the unsubscribe URL isn't
 * rewritten into a click-tracking redirect.
 */
export function appendUnsubscribeFooter(html, url) {
  if (!url) return html;

  const footer = '<div style="margin-top:28px;padding-top:12px;border-top:1px solid #e5e7eb;'
    + 'font-size:12px;color:#6b7280;font-family:Arial,Helvetica,sans-serif;">'
    + 'Don\'t want these emails? '
    + `<a href="${escapeHtml(url)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>`
    + '</div>';

  return `${html || ''}${footer}`;
}

/** Campaign name and recipient row for the confirmation page. */
export async function lookupUnsubscribeTarget({ campaignId, email }) {
  const address = normalizeEmail(email);
  if (!campaignId || !address) return null;

  const campaignRes = await dbRequest(
    `campaigns?id=eq.${encodeURIComponent(campaignId)}&select=id,name,from_email`,
  );
  const campaign = campaignRes.ok ? campaignRes.data?.[0] : null;
  if (!campaign) return null;

  const recipientRes = await dbRequest(
    `campaign_recipients?campaign_id=eq.${encodeURIComponent(campaignId)}`
      + `&email=eq.${encodeURIComponent(address)}`
      + `&select=id,status`,
  );
  const recipient = recipientRes.ok ? recipientRes.data?.[0] : null;

  return { campaign, recipient, email: address };
}

/**
 * Mark the recipient unsubscribed so later steps skip them. Idempotent: a second
 * visit reports `already` rather than failing.
 */
export async function unsubscribeCampaignRecipient({ campaignId, email }) {
  const address = normalizeEmail(email);
  if (!campaignId || !address) return { ok: false, error: 'invalid_input' };

  const target = await lookupUnsubscribeTarget({ campaignId, email: address });
  if (!target) return { ok: false, error: 'campaign_not_found' };
  if (!target.recipient) return { ok: false, error: 'recipient_not_found' };
  if (target.recipient.status === 'unsubscribed') {
    return { ok: true, already: true, campaign: target.campaign };
  }

  const patch = {
    status: 'unsubscribed',
    unsubscribed_at: new Date().toISOString(),
  };

  let res = await dbRequest(
    `campaign_recipients?id=eq.${encodeURIComponent(target.recipient.id)}`,
    { method: 'PATCH', body: patch, prefer: 'return=minimal' },
  );

  // Tolerate a deploy that runs ahead of the migration.
  if (!res.ok && /unsubscribed_at/.test(res.error || '')) {
    res = await dbRequest(
      `campaign_recipients?id=eq.${encodeURIComponent(target.recipient.id)}`,
      { method: 'PATCH', body: { status: 'unsubscribed' }, prefer: 'return=minimal' },
    );
  }

  if (!res.ok) {
    console.error('[unsubscribe] update failed:', res.error);
    return { ok: false, error: res.error || 'update_failed' };
  }

  return { ok: true, already: false, campaign: target.campaign };
}
