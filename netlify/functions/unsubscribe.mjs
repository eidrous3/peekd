import {
  lookupUnsubscribeTarget,
  unsubscribeCampaignRecipient,
  verifyUnsubscribeToken,
} from './_unsubscribe.mjs';

function extractToken(req) {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get('u') || url.searchParams.get('token') || '';
  if (fromQuery) return fromQuery.trim();

  const pathMatch = url.pathname.match(/\/(?:unsubscribe|u)\/([^/?]+)/);
  return pathMatch?.[1] ? decodeURIComponent(pathMatch[1]).trim() : '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page({ title, body, status = 200 }) {
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#f6f8fb;color:#0e1320;
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:24px}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px;max-width:440px;width:100%;
    box-shadow:0 8px 24px rgba(15,23,42,.06);text-align:center}
  h1{margin:0 0 10px;font-size:19px}
  p{margin:0 0 8px;color:#4a5365}
  .addr{font-weight:600;color:#0e1320;word-break:break-all}
  .btn{display:inline-block;margin-top:20px;padding:11px 20px;border:0;border-radius:9px;
    background:#2563eb;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
  .btn:hover{background:#1d4ed8}
  .muted{margin-top:18px;font-size:12.5px;color:#8a93a4}
</style>
</head><body><div class="card">${body}</div></body></html>`;

  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function invalidPage() {
  return page({
    title: 'Link expired',
    status: 400,
    body: '<h1>This link is no longer valid</h1>'
      + '<p>The unsubscribe link is incomplete or has expired. Reply to the email and ask to be removed, and the sender will take care of it.</p>',
  });
}

function donePage(email, campaignName, already) {
  return page({
    title: 'Unsubscribed',
    body: `<h1>${already ? 'Already unsubscribed' : 'You\'re unsubscribed'}</h1>`
      + `<p><span class="addr">${escapeHtml(email)}</span> will not receive further emails from`
      + ` ${campaignName ? `<b>${escapeHtml(campaignName)}</b>` : 'this sequence'}.</p>`
      + '<p class="muted">You can close this page.</p>',
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' },
    });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = extractToken(req);
  const payload = verifyUnsubscribeToken(token);
  if (!payload) return invalidPage();

  // Mail clients and security scanners prefetch links in the background, so a GET
  // only ever asks for confirmation. The actual opt-out happens on POST.
  if (req.method === 'GET') {
    const target = await lookupUnsubscribeTarget(payload);
    if (!target) return invalidPage();
    if (target.recipient?.status === 'unsubscribed') {
      return donePage(payload.email, target.campaign?.name, true);
    }

    const action = `/u/${encodeURIComponent(token)}`;
    return page({
      title: 'Unsubscribe',
      body: '<h1>Unsubscribe from these emails?</h1>'
        + `<p>We'll stop sending <span class="addr">${escapeHtml(payload.email)}</span> messages from`
        + ` ${target.campaign?.name ? `<b>${escapeHtml(target.campaign.name)}</b>` : 'this sequence'}.</p>`
        + `<form method="POST" action="${escapeHtml(action)}">`
        + '<button class="btn" type="submit">Confirm unsubscribe</button>'
        + '</form>'
        + '<p class="muted">Sent by a Peekd user. This only affects this sequence.</p>',
    });
  }

  try {
    const res = await unsubscribeCampaignRecipient(payload);
    if (!res.ok) {
      // A recipient removed from the campaign has nothing left to opt out of.
      if (res.error === 'recipient_not_found') {
        return donePage(payload.email, null, true);
      }
      console.error('[unsubscribe] failed:', res.error);
      return page({
        title: 'Something went wrong',
        status: 500,
        body: '<h1>We couldn\'t process that</h1>'
          + '<p>Please try again in a moment, or reply to the email to be removed.</p>',
      });
    }

    console.log(`[unsubscribe] ${payload.email} opted out of campaign ${payload.campaignId}`);
    return donePage(payload.email, res.campaign?.name, res.already);
  } catch (err) {
    console.error('[unsubscribe] unexpected error:', err);
    return page({
      title: 'Something went wrong',
      status: 500,
      body: '<h1>We couldn\'t process that</h1><p>Please try again in a moment.</p>',
    });
  }
};
