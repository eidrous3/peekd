import {
  getClientIp,
  pixelResponse,
  recordPixelOpen,
} from './_tracking.mjs';

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
    return pixelResponse();
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('k') || '';

  try {
    const result = await recordPixelOpen({
      pixelToken: token,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent') || '',
    });
    if (!result.ok) {
      console.error('[track-open] record failed:', result.error);
    }
  } catch (err) {
    console.error('[track-open] unexpected error:', err);
  }

  return pixelResponse();
};
