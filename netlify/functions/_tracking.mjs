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

export function generateClickToken() {
  return generatePixelToken();
}

export function clickTrackUrl(token) {
  const base = siteUrl();
  return `${base}/t/${String(token || '').trim()}`;
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

const ANCHOR_HREF_RE = /<a\b([^>]*?\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))([^>]*)>/gi;
const HTML_TAG_RE = /(<[^>]+>)/g;
const PLAIN_URL_RE = /\b(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/gi;

function isPeekdTrackingUrl(value) {
  if (/track-open|track-click/i.test(value)) return true;
  return /\/t\//.test(value) && /getpeekd\.com|netlify\.app|localhost/i.test(value);
}

export function stripTrailingUrlPunctuation(value) {
  return String(value || '').replace(/[.,;:!?)\]}]+$/g, '');
}

export function normalizeTrackableHref(href) {
  const value = stripTrailingUrlPunctuation(String(href || '').trim());
  if (!value || value.startsWith('#')) return null;
  if (/^(mailto:|tel:|javascript:|data:)/i.test(value)) return null;
  if (isPeekdTrackingUrl(value)) return null;

  let candidate = value;
  if (/^\/\//.test(candidate)) {
    candidate = `https:${candidate}`;
  } else if (!/^https?:\/\//i.test(candidate)) {
    if (!/^(www\.|[a-z0-9][-a-z0-9.]*\.[a-z]{2,}(\/|$))/i.test(candidate)) {
      return null;
    }
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (!/^https?:$/i.test(url.protocol)) return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function isTrackableHref(href) {
  return normalizeTrackableHref(href) != null;
}

function linkifyTextSegment(text) {
  return String(text || '').replace(PLAIN_URL_RE, (match) => {
    const cleaned = stripTrailingUrlPunctuation(match);
    const normalized = normalizeTrackableHref(cleaned);
    if (!normalized) return match;
    const suffix = match.slice(cleaned.length);
    return `<a href="${normalized}">${cleaned}</a>${suffix}`;
  });
}

export function linkifyPlainUrlsInHtml(html) {
  const parts = String(html || '').split(HTML_TAG_RE);
  let insideAnchor = 0;
  let insideSkip = 0;

  return parts.map((part) => {
    if (part.startsWith('<')) {
      if (/^<a\b/i.test(part)) insideAnchor += 1;
      else if (/^<\/a>/i.test(part)) insideAnchor = Math.max(0, insideAnchor - 1);
      else if (/^<(script|style)\b/i.test(part)) insideSkip += 1;
      else if (/^<\/(script|style)>/i.test(part)) insideSkip = Math.max(0, insideSkip - 1);
      return part;
    }
    if (insideAnchor > 0 || insideSkip > 0) return part;
    return linkifyTextSegment(part);
  }).join('');
}

export function prepareHtmlForLinkTracking(html) {
  return linkifyPlainUrlsInHtml(String(html || ''));
}

export function extractTrackableHrefs(html) {
  const urls = new Set();
  const body = String(html || '');
  ANCHOR_HREF_RE.lastIndex = 0;
  let match = ANCHOR_HREF_RE.exec(body);
  while (match) {
    const href = match[2] || match[3] || match[4] || '';
    const normalized = normalizeTrackableHref(href);
    if (normalized) urls.add(normalized);
    match = ANCHOR_HREF_RE.exec(body);
  }
  ANCHOR_HREF_RE.lastIndex = 0;
  return [...urls];
}

export function wrapLinksInHtml(html, urlToTrackingHref) {
  const map = urlToTrackingHref instanceof Map ? urlToTrackingHref : new Map(Object.entries(urlToTrackingHref || {}));
  if (!map.size) return String(html || '');

  return String(html || '').replace(ANCHOR_HREF_RE, (full, before, dbl, sgl, bare, after) => {
    const href = dbl || sgl || bare || '';
    const normalized = normalizeTrackableHref(href);
    const trackingHref = normalized ? map.get(normalized) : null;
    if (!trackingHref) return full;
    const quote = dbl != null ? '"' : (sgl != null ? "'" : '');
    if (quote) return `<a${before}href=${quote}${trackingHref}${quote}${after}>`;
    return `<a${before}href="${trackingHref}"${after}>`;
  });
}

export async function createTrackedLinksForSend(trackedEmailId, html) {
  const preparedHtml = prepareHtmlForLinkTracking(html);
  const originalUrls = extractTrackableHrefs(preparedHtml);
  if (!trackedEmailId || !originalUrls.length) {
    return { ok: true, links: [], urlToTrackingHref: new Map(), preparedHtml };
  }

  const rows = originalUrls.map((originalUrl) => ({
    tracked_email_id: trackedEmailId,
    original_url: originalUrl,
    click_token: generateClickToken(),
  }));

  const res = await dbRequest('tracked_links', {
    method: 'POST',
    body: rows,
    prefer: 'return=representation',
  });

  if (!res.ok || !Array.isArray(res.data)) {
    return { ok: false, error: res.error || 'tracked_link_create_failed' };
  }

  const urlToTrackingHref = new Map();
  for (const row of res.data) {
    urlToTrackingHref.set(row.original_url, clickTrackUrl(row.click_token));
  }

  return { ok: true, links: res.data, urlToTrackingHref, preparedHtml };
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
  return event?.classification === 'human';
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
    'tracked_links(id,original_url,click_token,email_click_events(id,clicked_at,classification,user_agent,ip))',
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
    const events = [...(recipient.email_open_events || [])]
      .sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime())
      .map((event) => ({
        ...event,
        classification: resolveEventClassification(event, trackedEmailRow.sent_at),
      }));
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
  const hot = opens > 2;

  const trackedLinks = trackedEmailRow.tracked_links || [];
  const links = buildLinkActivity(trackedLinks, recipients);
  const clickTimeline = buildClickTimelineEntries(trackedLinks, recipients);

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
      clickTimeline,
    }),
    links,
    recipientOpens: recipients.map((r) => ({
      email: r.email,
      name: r.name,
      opens: r.opens,
    })),
  };
}

export function buildTimelineFromEvents({ sentAt, recipients, clickTimeline = [] }) {
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
      if (!isCountableOpen(event)) continue;

      const key = recipient.email;
      const count = (openCounts.get(key) || 0) + 1;
      openCounts.set(key, count);
      const openedDate = new Date(event.opened_at);

      entries.push({
        type: 'opened',
        who: recipient.name,
        av: recipient.initials,
        label: count <= 1 ? 'opened' : `opened again (×${count})`,
        meta: 'Email client',
        time: formatMessageTime(event.opened_at),
        sortAt: openedDate.getTime(),
        proxy: false,
        classification: event.classification || 'human',
      });
    }
  }

  for (const clickEntry of clickTimeline || []) {
    entries.push({
      ...clickEntry,
      sortAt: clickEntry.sortAt ?? new Date(clickEntry.clickedAt || 0).getTime(),
    });
  }

  entries.sort((a, b) => a.sortAt - b.sortAt);
  return timeline.concat(entries.map(({ sortAt, clickedAt, ...rest }) => rest));
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
    links: tracking.links?.length ? tracking.links : message.links,
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

export function isGoogleInfrastructureIp(ip) {
  const value = String(ip || '').trim();
  if (!value) return false;
  return /^(66\.249|74\.125|64\.233|72\.14|209\.85|216\.239|172\.217|108\.177|142\.250|173\.194)\./.test(value);
}

export function isPrefetchBotUserAgent(userAgent) {
  const ua = String(userAgent || '');
  if (isGmailImageProxy(ua)) return false;
  if (/Chrome\/([1-9]|[1-4][0-9])\./i.test(ua)) return true;
  return /Googlebot|Google-HTTP|Feedfetcher|AdsBot/i.test(ua);
}

export function looksLikeHumanBrowser(userAgent) {
  const ua = String(userAgent || '').trim();
  if (!ua || ua.length < 20) return false;
  if (isPrefetchBotUserAgent(ua)) return false;
  return /Mozilla\/5\.0/i.test(ua);
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
  // Gmail wraps all remote images through GoogleImageProxy — that is the real open signal for Gmail.
  if (isGmailImageProxy(userAgent)) return 'human';

  if (isAppleProxyIp(ip)) return 'likely_proxy';
  if (isPrefetchBotUserAgent(userAgent)) return 'likely_proxy';
  if (isGoogleInfrastructureIp(ip) && !looksLikeHumanBrowser(userAgent)) return 'likely_proxy';

  const sentMs = sentAt ? new Date(sentAt).getTime() : NaN;
  const openedMs = openedAt instanceof Date ? openedAt.getTime() : new Date(openedAt).getTime();
  if (!Number.isNaN(sentMs) && !Number.isNaN(openedMs)) {
    const secondsSinceSend = (openedMs - sentMs) / 1000;
    if (secondsSinceSend >= 0 && secondsSinceSend < 60 && isAppleProxyIp(ip)) {
      return 'likely_proxy';
    }
  }

  if (looksLikeHumanBrowser(userAgent)) return 'human';
  return 'unknown';
}

export function resolveEventClassification(event, sentAt) {
  return classifyOpen({
    ip: event?.ip,
    userAgent: event?.user_agent,
    sentAt,
    openedAt: event?.opened_at ? new Date(event.opened_at) : new Date(),
  });
}

export function displayUrlForLink(url) {
  try {
    const parsed = new URL(String(url || ''));
    const host = parsed.host.replace(/^www\./i, '');
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${host}${path}` || host;
  } catch {
    return String(url || '').replace(/^https?:\/\//i, '').slice(0, 80);
  }
}

export function isCountableClick(event) {
  return event?.classification !== 'likely_proxy';
}

export function classifyClick({ ip, userAgent }) {
  if (isPrefetchBotUserAgent(userAgent)) return 'likely_proxy';
  if (isGoogleInfrastructureIp(ip) && !looksLikeHumanBrowser(userAgent)) return 'likely_proxy';
  if (looksLikeHumanBrowser(userAgent)) return 'human';
  return 'unknown';
}

export function buildLinkActivity(trackedLinks, recipients) {
  const singleRecipient = (recipients || []).length === 1 ? recipients[0] : null;
  const rows = (trackedLinks || []).map((link) => {
    const events = [...(link.email_click_events || [])]
      .filter(isCountableClick)
      .sort((a, b) => new Date(a.clicked_at).getTime() - new Date(b.clicked_at).getTime());
    const clicks = events.length;
    if (!clicks) return null;

    const lastEvent = events[events.length - 1];
    const byLabel = singleRecipient
      ? `${singleRecipient.name} ×${clicks}`
      : `${clicks} click${clicks === 1 ? '' : 's'}`;

    return {
      url: displayUrlForLink(link.original_url),
      clicks,
      last: relativeTime(new Date(lastEvent.clicked_at)),
      by: byLabel,
      w: 0,
    };
  }).filter(Boolean);

  if (!rows.length) return [];

  const maxClicks = Math.max(...rows.map((row) => row.clicks), 1);
  return rows
    .map((row) => ({ ...row, w: Math.round((row.clicks / maxClicks) * 100) }))
    .sort((a, b) => b.clicks - a.clicks);
}

export function buildClickTimelineEntries(trackedLinks, recipients) {
  const singleRecipient = (recipients || []).length === 1 ? recipients[0] : null;
  const clickCounts = new Map();
  const entries = [];

  for (const link of trackedLinks || []) {
    const events = [...(link.email_click_events || [])]
      .filter(isCountableClick)
      .sort((a, b) => new Date(a.clicked_at).getTime() - new Date(b.clicked_at).getTime());

    for (const event of events) {
      const key = link.original_url;
      const count = (clickCounts.get(key) || 0) + 1;
      clickCounts.set(key, count);
      const clickedAt = new Date(event.clicked_at);

      entries.push({
        type: 'link',
        who: singleRecipient?.name || null,
        av: singleRecipient?.initials || null,
        label: count <= 1 ? 'clicked a link' : `clicked a link (×${count})`,
        meta: displayUrlForLink(link.original_url),
        time: formatMessageTime(event.clicked_at),
        clickedAt: clickedAt.getTime(),
        sortAt: clickedAt.getTime(),
      });
    }
  }

  return entries;
}

export async function recordLinkClick({ clickToken, ip, userAgent }) {
  const token = String(clickToken || '').trim();
  if (!token) return { ok: true, recorded: false };

  const lookup = await dbRequest(
    `tracked_links?click_token=eq.${encodeURIComponent(token)}&select=id,original_url,tracked_emails(sent_at)`,
  );

  if (!lookup.ok || !lookup.data?.[0]) {
    return { ok: true, recorded: false };
  }

  const link = lookup.data[0];
  const clickedAt = new Date();
  const classification = classifyClick({ ip, userAgent });

  const insert = await dbRequest('email_click_events', {
    method: 'POST',
    body: {
      tracked_link_id: link.id,
      ip: ip || null,
      user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
      classification,
      clicked_at: clickedAt.toISOString(),
    },
    prefer: 'return=minimal',
  });

  if (!insert.ok) {
    return { ok: false, recorded: false, error: insert.error };
  }

  return {
    ok: true,
    recorded: true,
    redirectUrl: link.original_url,
    classification,
  };
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
