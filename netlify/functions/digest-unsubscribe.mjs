import { digestStatus, disableDigest, verifyDigestToken } from './_digest.mjs';

function extractToken(req) {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get('u') || url.searchParams.get('token') || '';
  if (fromQuery) return fromQuery.trim();
  const pathMatch = url.pathname.match(/\/(?:digest-unsubscribe|d)\/([^/?]+)/);
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
      + '<p>The unsubscribe link is incomplete or has expired.</p>',
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
  const payload = verifyDigestToken(token);
  if (!payload) return invalidPage();

  const status = await digestStatus(payload.userId);
  if (!status.ok) return invalidPage();

  if (req.method === 'GET') {
    if (!status.enabled) {
      return page({
        title: 'Unsubscribed',
        body: '<h1>Already unsubscribed</h1>'
          + '<p>You will not receive further daily digest emails from Peekd.</p>'
          + '<p class="muted">You can close this page.</p>',
      });
    }
    const action = `/d/${encodeURIComponent(token)}`;
    return page({
      title: 'Unsubscribe',
      body: '<h1>Unsubscribe from the daily digest?</h1>'
        + '<p>We\'ll stop sending the morning summary of yesterday\'s activity.</p>'
        + `<form method="POST" action="${escapeHtml(action)}">`
        + '<button class="btn" type="submit">Confirm unsubscribe</button>'
        + '</form>'
        + '<p class="muted">You can turn this back on later in Settings → Notifications.</p>',
    });
  }

  const res = await disableDigest(payload.userId);
  if (!res.ok) {
    return page({
      title: 'Could not unsubscribe',
      status: 502,
      body: '<h1>Something went wrong</h1><p>Try again in a moment, or turn off Daily digest in Settings.</p>',
    });
  }

  return page({
    title: 'Unsubscribed',
    body: '<h1>You\'re unsubscribed</h1>'
      + '<p>You will not receive further daily digest emails from Peekd.</p>'
      + '<p class="muted">You can close this page.</p>',
  });
};
