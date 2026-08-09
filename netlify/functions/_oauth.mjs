/** Shared OAuth plumbing for every mail provider (origin, redirects, CSRF state). */

export function siteOrigin(req) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (!host) return '';
  return `${proto}://${host}`;
}

export function callbackUri(req, functionName) {
  const origin = siteOrigin(req);
  return origin ? `${origin}/.netlify/functions/${functionName}` : '';
}

export function dashboardUrl(req, params = {}) {
  const origin = siteOrigin(req);
  const url = new URL('Peekd Dashboard.html', origin || 'https://localhost/');
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });
  return url.toString();
}

export function encodeState(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeState(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!parsed?.uid || !parsed?.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function makeState(userId) {
  return encodeState({
    uid: userId,
    exp: Date.now() + 10 * 60 * 1000,
    n: Math.random().toString(36).slice(2),
  });
}
