import { getUserFromToken } from './_gmail.mjs';
import { resolveSendCredentials, sendTrackedEmail } from './_send-tracked.mjs';
import { getClientIp } from './_tracking.mjs';

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
  const campaignId = body.campaignId || body.campaign_id || null;
  const campaignStepId = body.campaignStepId || body.campaign_step_id || null;
  const parsedAttachments = parseAttachments(body.attachments);
  if (!parsedAttachments.ok) return json({ error: parsedAttachments.error }, 400);

  if (!fromEmail) return json({ error: 'from_required' }, 400);
  if (!to.length) return json({ error: 'to_required' }, 400);
  if (!subject) return json({ error: 'subject_required' }, 400);
  if (!html && !parsedAttachments.attachments.length) return json({ error: 'body_required' }, 400);

  const tokenRes = await resolveSendCredentials(user.id, fromEmail);
  if (!tokenRes.ok) {
    const status = tokenRes.error === 'no_sending_account' ? 404 : 502;
    return json({ error: tokenRes.error }, status);
  }

  const result = await sendTrackedEmail({
    userId: user.id,
    accessToken: tokenRes.accessToken,
    fromEmail,
    to,
    subject,
    html,
    attachments: parsedAttachments.attachments,
    track,
    trackLinks,
    addBranding,
    campaignId,
    campaignStepId,
    senderIp: getClientIp(req),
    provider: tokenRes.provider,
  });

  if (!result.ok) {
    if (result.error === 'tracking_setup_failed' || String(result.error || '').includes('track')) {
      console.error('[gmail-send] tracking setup failed:', result.error);
    }
    return json({ ok: false, error: result.error }, 502);
  }

  return json({
    ok: true,
    messageId: result.messageId,
    threadId: result.threadId,
    trackedEmailId: result.trackedEmailId || null,
  });
};
