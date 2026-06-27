import {
  getClientIp,
  recordLinkClick,
} from './_tracking.mjs';

function extractToken(req) {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get('k') || url.searchParams.get('token') || '';
  if (fromQuery) return fromQuery.trim();

  const pathMatch = url.pathname.match(/\/(?:track-click|t)\/([^/?]+)/);
  return pathMatch?.[1]?.trim() || '';
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = extractToken(req);
  if (!token) {
    return Response.redirect('https://getpeekd.com', 302);
  }

  try {
    const result = await recordLinkClick({
      clickToken: token,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent') || '',
    });

    if (result.redirectUrl) {
      return Response.redirect(result.redirectUrl, 302);
    }
  } catch (err) {
    console.error('[track-click] unexpected error:', err);
  }

  return Response.redirect('https://getpeekd.com', 302);
};
