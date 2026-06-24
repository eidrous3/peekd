import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ipaddr from 'ipaddr.js';
import {
  dbRequest,
  formatMessageTime,
  relativeTime,
  siteUrl,
} from './_support.mjs';

const trackingModuleDir = path.dirname(fileURLToPath(import.meta.url));

const PIXEL_IMG_STYLE = 'display:block;width:1px;height:1px;border:0;';

export function generatePixelToken() {
  return crypto.randomBytes(16).toString('base64url');
}

export function pixelOpenUrl(token) {
  const base = siteUrl();
  return `${base}/.netlify/functions/track-open?k=${encodeURIComponent(token)}`;
}

export function injectTrackingPixels(html, pixelUrls) {
  const body = String(html || '').trim() || '<p></p>';
  const urls = Array.isArray(pixelUrls) ? pixelUrls.filter(Boolean) : [];
  if (!urls.length) return body;

  const tags = urls.map((url) => (
    `<img src="${url}" width="1" height="1" alt="" style="${PIXEL_IMG_STYLE}" />`
  )).join('');

  return `${body}${tags}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function initialsFromEmail(email) {
  const local = normalizeEmail(email).split('@')[0] || '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || '?';
}

function displayNameFromEmail(email) {
  const local = normalizeEmail(email).split('@')[0] || 'Recipient';
  return local.split(/[._-]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || local;
}

export function isCountableOpen(event) {
  return event?.classification !== 'likely_proxy';
}

export function countCountableOpens(events) {
  return (events || []).filter(isCountableOpen).length;
}

export async function createTrackedSend({
  userId,
  fromEmail,
  subject,
  to,
  gmailMessageId,
  gmailThreadId,
  sentAt,
}) {
  const recipients = [...new Set((Array.isArray(to) ? to : []).map(normalizeEmail).filter(Boolean))];
  if (!userId || !fromEmail || !subject || !recipients.length) {
    return { ok: false, error: 'invalid_tracked_send' };
  }

  const emailRes = await dbRequest('tracked_emails', {
    method: 'POST',
    body: {
      user_id: userId,
      from_email: normalizeEmail(fromEmail),
      subject: String(subject).trim(),
      gmail_message_id: gmailMessageId || null,
      gmail_thread_id: gmailThreadId || null,
      sent_at: sentAt || new Date().toISOString(),
    },
    prefer: 'return=representation',
  });

  if (!emailRes.ok || !emailRes.data?.[0]) {
    return { ok: false, error: emailRes.error || 'tracked_email_create_failed' };
  }

  const trackedEmail = emailRes.data[0];
  const recipientRows = recipients.map((email) => ({
    tracked_email_id: trackedEmail.id,
    email,
    pixel_token: generatePixelToken(),
  }));

  const recipientRes = await dbRequest('tracked_recipients', {
    method: 'POST',
    body: recipientRows,
    prefer: 'return=representation',
  });

  if (!recipientRes.ok || !Array.isArray(recipientRes.data)) {
    return { ok: false, error: recipientRes.error || 'tracked_recipient_create_failed' };
  }

  const mappedRecipients = recipientRes.data.map((row) => ({
    id: row.id,
    email: row.email,
    pixelToken: row.pixel_token,
    pixelUrl: pixelOpenUrl(row.pixel_token),
  }));

  return {
    ok: true,
    trackedEmailId: trackedEmail.id,
    trackedEmail,
    recipients: mappedRecipients,
    pixelUrls: mappedRecipients.map((r) => r.pixelUrl),
  };
}

export async function updateTrackedSendGmailIds(trackedEmailId, { gmailMessageId, gmailThreadId } = {}) {
  if (!trackedEmailId) return { ok: false, error: 'id_required' };

  const body = {};
  if (gmailMessageId) body.gmail_message_id = gmailMessageId;
  if (gmailThreadId) body.gmail_thread_id = gmailThreadId;
  if (!Object.keys(body).length) return { ok: false, error: 'nothing_to_update' };

  const res = await dbRequest(`tracked_emails?id=eq.${encodeURIComponent(trackedEmailId)}`, {
    method: 'PATCH',
    body,
    prefer: 'return=representation',
  });

  if (!res.ok || !res.data?.[0]) {
    return { ok: false, error: res.error || 'update_failed' };
  }

  return { ok: true, trackedEmail: res.data[0] };
}

function postgrestInFilter(values) {
  return `(${values.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',')})`;
}

export async function getTrackingByMessageIds(userId, gmailMessageIds) {
  const ids = [...new Set((gmailMessageIds || []).filter(Boolean))];
  if (!userId || !ids.length) return {};

  const select = [
    'id',
    'gmail_message_id',
    'gmail_thread_id',
    'sent_at',
    'subject',
    'from_email',
    'tracked_recipients(id,email,email_open_events(id,opened_at,classification,user_agent,ip))',
  ].join(',');

  const res = await dbRequest(
    `tracked_emails?user_id=eq.${encodeURIComponent(userId)}&gmail_message_id=in.${postgrestInFilter(ids)}&select=${encodeURIComponent(select)}`,
  );

  if (!res.ok || !Array.isArray(res.data)) return {};

  const byMessageId = {};
  for (const row of res.data) {
    if (!row.gmail_message_id) continue;
    byMessageId[row.gmail_message_id] = buildTrackingSummary(row);
  }
  return byMessageId;
}

export function buildTrackingSummary(trackedEmailRow) {
  const sentDate = new Date(trackedEmailRow.sent_at || Date.now());
  const recipients = (trackedEmailRow.tracked_recipients || []).map((recipient) => {
    const events = [...(recipient.email_open_events || [])].sort(
      (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime(),
    );
    return {
      email: recipient.email,
      name: displayNameFromEmail(recipient.email),
      initials: initialsFromEmail(recipient.email),
      events,
      opens: countCountableOpens(events),
    };
  });

  const allEvents = recipients.flatMap((r) => r.events.map((e) => ({ ...e, recipient: r })));
  const countableEvents = allEvents.filter(isCountableOpen).sort(
    (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime(),
  );
  const opens = countableEvents.length;
  const lastEvent = countableEvents[countableEvents.length - 1];
  const lastOpened = lastEvent ? relativeTime(new Date(lastEvent.opened_at)) : '—';
  const hot = lastEvent
    ? (Date.now() - new Date(lastEvent.opened_at).getTime()) < 3_600_000
    : false;

  return {
    trackedEmailId: trackedEmailRow.id,
    gmailMessageId: trackedEmailRow.gmail_message_id,
    gmailThreadId: trackedEmailRow.gmail_thread_id,
    sentAt: trackedEmailRow.sent_at,
    opens,
    lastOpened,
    hot,
    badge: opens > 0 ? 'OPENED' : 'SENT',
    timeline: buildTimelineFromEvents({
      sentAt: sentDate,
      recipients,
    }),
    recipientOpens: recipients.map((r) => ({
      email: r.email,
      name: r.name,
      opens: r.opens,
    })),
  };
}

export function buildTimelineFromEvents({ sentAt, recipients }) {
  const sentMeta = formatMessageTime(sentAt instanceof Date ? sentAt.toISOString() : sentAt);
  const timeline = [
    { type: 'sent', label: 'Sent', meta: sentMeta },
  ];

  const openCounts = new Map();
  const entries = [];

  for (const recipient of recipients || []) {
    const sorted = [...(recipient.events || [])].sort(
      (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime(),
    );

    for (const event of sorted) {
      const key = recipient.email;
      const isProxy = event.classification === 'likely_proxy';
      if (!isProxy) {
        openCounts.set(key, (openCounts.get(key) || 0) + 1);
      }
      const count = openCounts.get(key) || 0;
      const openedDate = new Date(event.opened_at);

      entries.push({
        type: 'opened',
        who: recipient.name,
        av: recipient.initials,
        label: isProxy
          ? 'Likely proxy open (Apple Mail)'
          : count <= 1
            ? 'opened'
            : `opened again (×${count})`,
        meta: isProxy ? 'Privacy proxy · approximate location' : 'Email client',
        time: formatMessageTime(event.opened_at),
        openedAt: openedDate.getTime(),
        proxy: isProxy,
        classification: event.classification,
      });
    }
  }

  entries.sort((a, b) => a.openedAt - b.openedAt);
  return timeline.concat(entries.map(({ openedAt, ...rest }) => rest));
}

export function mergeTrackingIntoMessage(message, tracking) {
  if (!message || !tracking) return message;
  return {
    ...message,
    opens: tracking.opens,
    badge: tracking.badge || message.badge,
    lastOpened: tracking.lastOpened,
    hot: tracking.hot,
    timeline: tracking.timeline?.length ? tracking.timeline : message.timeline,
    recipientOpens: tracking.recipientOpens || [],
    trackedEmailId: tracking.trackedEmailId,
  };
}

export const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

export const pixelResponseHeaders = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export function pixelResponse() {
  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: pixelResponseHeaders,
  });
}

export function getClientIp(req) {
  const direct = req.headers.get('x-nf-client-connection-ip')
    || req.headers.get('client-ip')
    || req.headers.get('x-real-ip');
  if (direct) return direct.trim();

  const forwarded = req.headers.get('x-forwarded-for');
  if (!forwarded) return '';
  return forwarded.split(',')[0].trim();
}

export function isGmailImageProxy(userAgent) {
  return /GoogleImageProxy|ggpht\.com/i.test(userAgent || '');
}

let appleCidrsCache = null;
let appleBucketsCache = null;

export function getAppleEgressCidrs() {
  if (appleCidrsCache) return appleCidrsCache;
  try {
    const raw = fs.readFileSync(path.join(trackingModuleDir, '_apple-egress-ips.json'), 'utf8');
    const data = JSON.parse(raw);
    appleCidrsCache = Array.isArray(data.cidrs) ? data.cidrs : [];
  } catch {
    appleCidrsCache = [];
  }
  return appleCidrsCache;
}

function getAppleBuckets() {
  if (appleBucketsCache) return appleBucketsCache;
  const buckets = new Map();
  for (const cidr of getAppleEgressCidrs()) {
    const base = String(cidr).split('/')[0];
    if (base.includes(':')) continue;
    const parts = base.split('.');
    if (parts.length < 2) continue;
    const key = `${parts[0]}.${parts[1]}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(cidr);
  }
  appleBucketsCache = buckets;
  return appleBucketsCache;
}

export function ipInCidr(ip, cidr) {
  try {
    const addr = ipaddr.parse(String(ip || '').trim());
    const [range, bitsStr] = String(cidr || '').split('/');
    const bits = parseInt(bitsStr, 10);
    if (!range || Number.isNaN(bits)) return false;
    return addr.match(ipaddr.parse(range), bits);
  } catch {
    return false;
  }
}

export function isAppleProxyIp(ip) {
  const value = String(ip || '').trim();
  if (!value) return false;

  if (value.includes(':')) {
    return getAppleEgressCidrs()
      .filter((cidr) => String(cidr).includes(':'))
      .some((cidr) => ipInCidr(value, cidr));
  }

  const parts = value.split('.');
  if (parts.length !== 4) return false;
  const bucket = getAppleBuckets().get(`${parts[0]}.${parts[1]}`);
  if (!bucket?.length) return false;
  return bucket.some((cidr) => ipInCidr(value, cidr));
}

export function classifyOpen({ ip, userAgent, sentAt, openedAt = new Date() }) {
  if (isGmailImageProxy(userAgent)) return 'likely_proxy';
  if (isAppleProxyIp(ip)) return 'likely_proxy';

  const sentMs = sentAt ? new Date(sentAt).getTime() : NaN;
  const openedMs = openedAt instanceof Date ? openedAt.getTime() : new Date(openedAt).getTime();
  if (!Number.isNaN(sentMs) && !Number.isNaN(openedMs)) {
    const secondsSinceSend = (openedMs - sentMs) / 1000;
    if (secondsSinceSend >= 0 && secondsSinceSend < 60 && isAppleProxyIp(ip)) {
      return 'likely_proxy';
    }
  }

  return 'unknown';
}

export async function recordPixelOpen({ pixelToken, ip, userAgent }) {
  const token = String(pixelToken || '').trim();
  if (!token) return { ok: true, recorded: false };

  const lookup = await dbRequest(
    `tracked_recipients?pixel_token=eq.${encodeURIComponent(token)}&select=id,email,tracked_emails(sent_at)`,
  );

  if (!lookup.ok || !lookup.data?.[0]) {
    return { ok: true, recorded: false };
  }

  const recipient = lookup.data[0];
  const sentAt = recipient.tracked_emails?.sent_at;
  const openedAt = new Date();
  const classification = classifyOpen({
    ip,
    userAgent,
    sentAt,
    openedAt,
  });

  const insert = await dbRequest('email_open_events', {
    method: 'POST',
    body: {
      tracked_recipient_id: recipient.id,
      ip: ip || null,
      user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
      classification,
      opened_at: openedAt.toISOString(),
    },
    prefer: 'return=minimal',
  });

  if (!insert.ok) {
    return { ok: false, recorded: false, error: insert.error };
  }

  return {
    ok: true,
    recorded: true,
    recipientId: recipient.id,
    classification,
  };
}
