import {
  getConnectedAccounts,
  getUserFromToken,
  getValidAccessToken,
  sendGmailMessage,
} from './_gmail.mjs';
import {
  createTrackedSend,
  createTrackedLinksForSend,
  injectTrackingPixels,
  updateTrackedSendGmailIds,
  wrapLinksInHtml,
} from './_tracking.mjs';
import { dbRequest } from './_support.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

function parseAttachments(raw) {
  if (!Array.isArray(raw)) return { ok: true, attachments: [] };

  const attachments = [];
  let totalBytes = 0;

  for (const item of raw) {
    const filename = String(item?.filename || item?.name || '').trim();
    const mimeType = String(item?.mimeType || item?.contentType || 'application/octet-stream').trim();
    const data = String(item?.data || item?.content || '').replace(/\s/g, '');

    if (!filename || !data) return { ok: false, error: 'invalid_attachment' };
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) return { ok: false, error: 'invalid_attachment' };

    const bytes = Math.floor((data.length * 3) / 4);
    if (bytes > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'attachment_too_large' };
    totalBytes += bytes;
    if (totalBytes > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'attachments_too_large' };

    attachments.push({ filename, mimeType, data });
  }

  return { ok: true, attachments };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const fromEmail = String(body.fromEmail || '').trim().toLowerCase();
  const to = Array.isArray(body.to) ? body.to.map((e) => String(e).trim().toLowerCase()).filter(isEmail) : [];
  const subject = String(body.subject || '').trim();
  const html = String(body.html || '').trim();
  const addBranding = body.addBranding === true;
  const track = body.track !== false;
  const trackLinks = body.trackLinks === true;
  const parsedAttachments = parseAttachments(body.attachments);
  if (!parsedAttachments.ok) return json({ error: parsedAttachments.error }, 400);

  if (!fromEmail) return json({ error: 'from_required' }, 400);
  if (!to.length) return json({ error: 'to_required' }, 400);
  if (!subject) return json({ error: 'subject_required' }, 400);
  if (!html && !parsedAttachments.attachments.length) return json({ error: 'body_required' }, 400);

  const accounts = await getConnectedAccounts(user.id, { email: fromEmail });
  const account = accounts[0];
  if (!account) return json({ error: 'no_gmail_account' }, 404);

  const accessToken = await getValidAccessToken(account);
  if (!accessToken) return json({ error: 'token_refresh_failed' }, 502);

  let tracked = null;
  if (track) {
    tracked = await createTrackedSend({
      userId: user.id,
      fromEmail,
      subject,
      to,
    });
    if (!tracked.ok) {
      console.error('[gmail-send] tracking setup failed:', tracked.error);
      return json({ ok: false, error: tracked.error || 'tracking_setup_failed' }, 502);
    }
  }

  let finalHtml = html || '<p></p>';
  if (track && tracked?.pixelUrls?.length) {
    finalHtml = injectTrackingPixels(finalHtml, tracked.pixelUrls);
  }
  if (track && trackLinks && tracked?.trackedEmailId) {
    const links = await createTrackedLinksForSend(tracked.trackedEmailId, finalHtml);
    if (links.ok) {
      if (links.preparedHtml) finalHtml = links.preparedHtml;
      if (links.urlToTrackingHref?.size) {
        finalHtml = wrapLinksInHtml(finalHtml, links.urlToTrackingHref);
      }
    } else {
      console.error('[gmail-send] link tracking setup failed:', links.error);
    }
  }
  if (addBranding) {
    finalHtml += '<p style="margin-top:24px;font-size:11px;color:#94a3b8;">Tracked by Peekd</p>';
  }

  const sent = await sendGmailMessage(accessToken, {
    from: fromEmail,
    to,
    subject,
    html: finalHtml,
    attachments: parsedAttachments.attachments,
  });

  if (!sent.ok) {
    if (tracked?.trackedEmailId) {
      await dbRequest(`tracked_emails?id=eq.${encodeURIComponent(tracked.trackedEmailId)}`, {
        method: 'DELETE',
      });
    }
    return json({ ok: false, error: sent.error }, 502);
  }

  if (track && tracked?.trackedEmailId) {
    const patch = await updateTrackedSendGmailIds(tracked.trackedEmailId, {
      gmailMessageId: sent.messageId,
      gmailThreadId: sent.threadId,
    });
    if (!patch.ok) {
      console.error('[gmail-send] tracking patch failed:', patch.error);
    }
  }

  return json({
    ok: true,
    messageId: sent.messageId,
    threadId: sent.threadId,
    trackedEmailId: tracked?.trackedEmailId || null,
  });
};
