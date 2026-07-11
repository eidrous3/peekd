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
const OPEN_DEDUPE_WINDOW_MS = 45_000;

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
    'tracked_recipients(id,email,email_open_events(id,opened_at,classification,user_agent,ip,location_label))',
    'tracked_links(id,original_url,click_token,email_click_events(id,clicked_at,classification,user_agent,ip,location_label))',
  ].join(',');

  const res = await dbRequest(
    `tracked_emails?user_id=eq.${encodeURIComponent(userId)}&gmail_message_id=in.${postgrestInFilter(ids)}&select=${encodeURIComponent(select)}`,
  );

  if (!res.ok || !Array.isArray(res.data)) return {};

  const byMessageId = {};
  for (const row of res.data) {
    if (!row.gmail_message_id) continue;
    await enrichTrackedEmailLocations(row);
    byMessageId[row.gmail_message_id] = buildTrackingSummary(row);
  }
  return byMessageId;
}

export function parseDeviceFromUserAgent(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return '—';
  if (isGmailImageProxy(ua)) return 'Gmail';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/CrOS/i.test(ua)) return 'Chromebook';
  if (/Linux/i.test(ua)) return 'Linux';
  if (looksLikeHumanBrowser(ua)) return 'Web browser';
  return 'Email client';
}

function isPrivateOrInfrastructureIp(ip) {
  const value = String(ip || '').trim();
  if (!value) return true;
  if (isGoogleInfrastructureIp(value)) return true;
  if (isAppleProxyIp(value)) return true;
  try {
    const addr = ipaddr.parse(value);
    const range = addr.range();
    if (range === 'private' || range === 'loopback' || range === 'linkLocal') return true;
  } catch { /* fall through */ }
  return false;
}

const geoCache = new Map();

export function formatGeoLookupResult(data) {
  if (!data || data.status !== 'success') return null;
  const parts = [data.city, data.regionName].map((part) => String(part || '').trim()).filter(Boolean);
  if (parts.length) return parts.join(', ');
  const country = String(data.country || '').trim();
  return country || null;
}

export async function lookupLocationLabel(ip) {
  const value = String(ip || '').trim();
  if (!value || isPrivateOrInfrastructureIp(value)) return null;
  if (geoCache.has(value)) return geoCache.get(value);

  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(value)}?fields=status,city,regionName,country`,
      { signal: AbortSignal.timeout(2500) },
    );
    const data = await res.json().catch(() => ({}));
    const label = formatGeoLookupResult(data);
    geoCache.set(value, label);
    return label;
  } catch {
    geoCache.set(value, null);
    return null;
  }
}

export function locationLabelFromEvent(event) {
  const stored = String(event?.location_label || '').trim();
  if (stored) return stored;
  const cached = geoCache.get(String(event?.ip || '').trim());
  if (cached) return cached;
  if (isPrivateOrInfrastructureIp(event?.ip)) return '—';
  return '—';
}

export function locationLabelFromIp(ip) {
  return locationLabelFromEvent({ ip });
}

async function enrichTrackedEmailLocations(trackedEmailRow) {
  const geoEvents = [];

  for (const recipient of trackedEmailRow.tracked_recipients || []) {
    for (const event of recipient.email_open_events || []) {
      geoEvents.push({ kind: 'open', event });
    }
  }

  for (const link of trackedEmailRow.tracked_links || []) {
    for (const event of link.email_click_events || []) {
      geoEvents.push({ kind: 'click', event, linkId: link.id });
    }
  }

  const ips = [...new Set(
    geoEvents
      .filter(({ event }) => !event.location_label && event.ip && !isPrivateOrInfrastructureIp(event.ip))
      .map(({ event }) => String(event.ip).trim()),
  )];

  if (ips.length) {
    await Promise.all(ips.map((ip) => lookupLocationLabel(ip)));
  }

  for (const recipient of trackedEmailRow.tracked_recipients || []) {
    recipient.email_open_events = (recipient.email_open_events || []).map((event) => {
      if (event.location_label) return event;
      const label = geoCache.get(String(event.ip || '').trim());
      return label ? { ...event, location_label: label } : event;
    });
  }

  for (const link of trackedEmailRow.tracked_links || []) {
    link.email_click_events = (link.email_click_events || []).map((event) => {
      if (event.location_label) return event;
      const label = geoCache.get(String(event.ip || '').trim());
      return label ? { ...event, location_label: label } : event;
    });
  }

  for (const { kind, event } of geoEvents) {
    if (event.location_label || !event.id) continue;
    const label = geoCache.get(String(event.ip || '').trim());
    if (!label) continue;
    const table = kind === 'click' ? 'email_click_events' : 'email_open_events';
    dbRequest(`${table}?id=eq.${encodeURIComponent(event.id)}`, {
      method: 'PATCH',
      body: { location_label: label },
      prefer: 'return=minimal',
    }).catch(() => {});
  }

  return trackedEmailRow;
}

export function formatOpenEventMeta(event) {
  const device = parseDeviceFromUserAgent(event?.user_agent);
  const location = locationLabelFromEvent(event);
  if (device === '—' && location === '—') return 'Email client';
  if (location === '—') return device;
  return `${device} · ${location}`;
}

function pickMostCommon(values) {
  const counts = new Map();
  for (const value of values) {
    const key = String(value || '—');
    if (key === '—') continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (!counts.size) return '—';
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function buildEngagementFromEvents(events, sentAt) {
  const countable = (events || [])
    .filter(isCountableOpen)
    .sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());

  if (!countable.length) {
    return { opens: 0, lastOpened: '—', device: '—', location: '—', deviceSource: null, locationSource: null };
  }

  const last = countable[countable.length - 1];
  const devices = countable.map((event) => parseDeviceFromUserAgent(event.user_agent));
  const locations = countable.map((event) => locationLabelFromEvent(event));

  return {
    opens: countable.length,
    lastOpened: relativeTime(new Date(last.opened_at)),
    device: pickMostCommon(devices) || parseDeviceFromUserAgent(last.user_agent),
    location: pickMostCommon(locations),
    deviceSource: 'open',
    locationSource: 'open',
  };
}

function isWeakOpenDevice(device) {
  const value = String(device || '').trim();
  return !value || value === '—' || value === 'Gmail' || value === 'Email client';
}

function isWeakOpenLocation(location) {
  const value = String(location || '').trim();
  return !value || value === '—';
}

export function buildEngagementFromClickEvents(events) {
  const countable = (events || [])
    .filter(isCountableClick)
    .sort((a, b) => new Date(a.clicked_at).getTime() - new Date(b.clicked_at).getTime());

  if (!countable.length) {
    return { clicks: 0, lastClicked: '—', device: '—', location: '—' };
  }

  const last = countable[countable.length - 1];
  const devices = countable.map((event) => parseDeviceFromUserAgent(event.user_agent));
  const locations = countable.map((event) => locationLabelFromEvent(event));

  return {
    clicks: countable.length,
    lastClicked: relativeTime(new Date(last.clicked_at)),
    device: pickMostCommon(devices) || parseDeviceFromUserAgent(last.user_agent),
    location: pickMostCommon(locations),
  };
}

export function collectClickEvents(trackedLinks) {
  return (trackedLinks || []).flatMap((link) => (
    (link.email_click_events || []).map((event) => ({ ...event, linkUrl: link.original_url }))
  ));
}

export function mergeEngagementWithClicks(openEngagement, clickEngagement) {
  const base = {
    ...openEngagement,
    deviceSource: openEngagement?.deviceSource || 'open',
    locationSource: openEngagement?.locationSource || 'open',
  };

  if (!clickEngagement?.clicks) return base;

  const merged = { ...base, clickEngagement };
  if (isWeakOpenDevice(base.device) && !isWeakOpenDevice(clickEngagement.device)) {
    merged.device = clickEngagement.device;
    merged.deviceSource = 'click';
  }
  if (isWeakOpenLocation(base.location) && !isWeakOpenLocation(clickEngagement.location)) {
    merged.location = clickEngagement.location;
    merged.locationSource = 'click';
  }
  return merged;
}

export function formatClickEventMeta(event, url) {
  const device = parseDeviceFromUserAgent(event?.user_agent);
  const location = locationLabelFromEvent(event);
  const urlPart = displayUrlForLink(url);
  const parts = [];
  if (device && device !== '—') parts.push(device);
  if (location && location !== '—') parts.push(location);
  if (urlPart) parts.push(urlPart);
  return parts.join(' · ') || urlPart || 'Link';
}

export function buildOpenSeriesFromEvents(events, sentAt, points = 14) {
  const countable = (events || [])
    .filter(isCountableOpen)
    .sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());
  const buckets = Array.from({ length: points }, () => 0);
  if (!countable.length) return buckets;

  const sentMs = new Date(sentAt || countable[0].opened_at).getTime();
  const msPerDay = 86_400_000;

  for (const event of countable) {
    const dayIndex = Math.floor((new Date(event.opened_at).getTime() - sentMs) / msPerDay);
    if (dayIndex >= 0 && dayIndex < points) buckets[dayIndex] += 1;
    else if (dayIndex >= points) buckets[points - 1] += 1;
  }

  return buckets;
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
  const allClickEvents = collectClickEvents(trackedEmailRow.tracked_links || []);
  const engagementAll = mergeEngagementWithClicks(
    buildEngagementFromEvents(countableEvents, trackedEmailRow.sent_at),
    buildEngagementFromClickEvents(allClickEvents),
  );
  const opens = engagementAll.opens;
  const lastOpened = engagementAll.lastOpened;
  const hot = opens > 2;

  const recipientEngagement = recipients.map((recipient) => ({
    email: recipient.email,
    name: recipient.name,
    ...mergeEngagementWithClicks(
      buildEngagementFromEvents(recipient.events, trackedEmailRow.sent_at),
      buildEngagementFromClickEvents(allClickEvents),
    ),
  }));

  const trackedLinks = trackedEmailRow.tracked_links || [];
  const links = buildLinkActivity(trackedLinks, recipients);
  const clickTimeline = buildClickTimelineEntries(trackedLinks, recipients);
  const openSeries = buildOpenSeriesFromEvents(countableEvents, trackedEmailRow.sent_at);

  return {
    trackedEmailId: trackedEmailRow.id,
    gmailMessageId: trackedEmailRow.gmail_message_id,
    gmailThreadId: trackedEmailRow.gmail_thread_id,
    sentAt: trackedEmailRow.sent_at,
    opens,
    lastOpened,
    device: engagementAll.device,
    location: engagementAll.location,
    engagementAll,
    recipientEngagement,
    openSeries,
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
        meta: formatOpenEventMeta(event),
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

  let badge = tracking.badge || message.badge;
  if (message.badge === 'REPLIED') badge = 'REPLIED';
  else if (badge !== 'REPLIED' && (tracking.badge === 'OPENED' || message.badge === 'OPENED')) badge = 'OPENED';

  const baseTimeline = message.timeline || [];
  const trackedTimeline = tracking.timeline || [];
  const replyEvents = baseTimeline.filter((event) => event.type === 'replied');
  const timeline = replyEvents.length
    ? [...trackedTimeline.filter((event) => event.type !== 'replied'), ...replyEvents]
    : (trackedTimeline.length ? trackedTimeline : baseTimeline);

  return {
    ...message,
    opens: tracking.opens,
    badge,
    lastOpened: tracking.lastOpened,
    device: tracking.device || message.device,
    location: tracking.location || message.location,
    deviceSource: tracking.engagementAll?.deviceSource || message.deviceSource || null,
    locationSource: tracking.engagementAll?.locationSource || message.locationSource || null,
    hot: tracking.hot,
    timeline,
    links: tracking.links?.length ? tracking.links : message.links,
    recipientOpens: tracking.recipientOpens || [],
    recipientEngagement: tracking.recipientEngagement || [],
    engagementAll: tracking.engagementAll || null,
    openSeries: tracking.openSeries || [],
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

export function isProxyPixelFetch({ ip, userAgent, sentAt, openedAt = new Date() }) {
  if (isGmailImageProxy(userAgent)) return true;
  if (isAppleProxyIp(ip)) return true;
  if (isPrefetchBotUserAgent(userAgent)) return true;
  if (isGoogleInfrastructureIp(ip) && isGmailImageProxy(userAgent)) return true;
  if (isGoogleInfrastructureIp(ip) && !looksLikeHumanBrowser(userAgent)) return true;

  const sentMs = sentAt ? new Date(sentAt).getTime() : NaN;
  const openedMs = openedAt instanceof Date ? openedAt.getTime() : new Date(openedAt).getTime();
  if (!Number.isNaN(sentMs) && !Number.isNaN(openedMs)) {
    const secondsSinceSend = (openedMs - sentMs) / 1000;
    if (secondsSinceSend >= 0 && secondsSinceSend < 60 && isAppleProxyIp(ip)) return true;
  }

  return false;
}

function isStoredOpenFromProxy(event, sentAt) {
  if (!event) return false;
  if (event.classification === 'likely_proxy') return true;
  return isProxyPixelFetch({
    ip: event.ip,
    userAgent: event.user_agent,
    sentAt,
    openedAt: event.opened_at ? new Date(event.opened_at) : new Date(),
  });
}

async function fetchRecentOpenEvents(recipientId, openedAt) {
  const since = new Date(openedAt.getTime() - OPEN_DEDUPE_WINDOW_MS).toISOString();
  const res = await dbRequest(
    `email_open_events?tracked_recipient_id=eq.${encodeURIComponent(recipientId)}&opened_at=gte.${encodeURIComponent(since)}&select=id,classification,user_agent,ip,opened_at&order=opened_at.desc&limit=5`,
  );
  return res.ok && Array.isArray(res.data) ? res.data : [];
}

async function deleteOpenEvents(events) {
  const ids = (events || []).map((event) => event.id).filter(Boolean);
  if (!ids.length) return;
  await dbRequest(`email_open_events?id=in.${postgrestInFilter(ids)}`, { method: 'DELETE' });
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
    const device = parseDeviceFromUserAgent(lastEvent.user_agent);
    const location = locationLabelFromEvent(lastEvent);
    const detailParts = [device, location].filter((part) => part && part !== '—');
    const byLabel = singleRecipient
      ? `${singleRecipient.name} ×${clicks}`
      : `${clicks} click${clicks === 1 ? '' : 's'}`;

    return {
      url: displayUrlForLink(link.original_url),
      clicks,
      last: relativeTime(new Date(lastEvent.clicked_at)),
      device,
      location,
      detail: detailParts.join(' · '),
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
        meta: formatClickEventMeta(event, link.original_url),
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
  const locationLabel = await lookupLocationLabel(ip);

  const insert = await dbRequest('email_click_events', {
    method: 'POST',
    body: {
      tracked_link_id: link.id,
      ip: ip || null,
      user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
      classification,
      location_label: locationLabel,
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
  const incomingProxy = isProxyPixelFetch({ ip, userAgent, sentAt, openedAt });
  const classification = classifyOpen({
    ip,
    userAgent,
    sentAt,
    openedAt,
  });

  const recentEvents = await fetchRecentOpenEvents(recipient.id, openedAt);
  const recentProxies = recentEvents.filter((event) => isStoredOpenFromProxy(event, sentAt));
  const recentHumans = recentEvents.filter((event) => event.classification === 'human');
  const humanUpgradesProxy = classification === 'human' && recentProxies.length > 0 && recentHumans.length === 0;

  if (humanUpgradesProxy) {
    await deleteOpenEvents(recentProxies);
  } else if (classification === 'human' && incomingProxy && recentHumans.some((event) => isStoredOpenFromProxy(event, sentAt))) {
    return { ok: true, recorded: false, deduped: true, recipientId: recipient.id };
  } else if ((incomingProxy || classification === 'likely_proxy') && (recentHumans.length || recentProxies.length)) {
    return { ok: true, recorded: false, deduped: true, recipientId: recipient.id };
  }

  const locationLabel = await lookupLocationLabel(ip);

  const insert = await dbRequest('email_open_events', {
    method: 'POST',
    body: {
      tracked_recipient_id: recipient.id,
      ip: ip || null,
      user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
      classification,
      location_label: locationLabel,
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
