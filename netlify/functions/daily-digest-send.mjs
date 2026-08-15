import { sendDueDigests } from './_digest.mjs';

/**
 * Hourly cron: send the daily digest at 08:00 in each user's timezone.
 * Invoked by Netlify Scheduled Functions (no auth header).
 */
export default async () => {
  const started = Date.now();
  console.log('[daily-digest-send] starting');

  try {
    const summary = await sendDueDigests({ now: new Date(), limit: 30 });
    const body = {
      ...summary,
      elapsedMs: Date.now() - started,
    };
    console.log('[daily-digest-send] done', JSON.stringify(body));
    return new Response(JSON.stringify(body), {
      status: summary.ok || summary.error === 'email_not_configured' ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err?.message || String(err);
    console.error('[daily-digest-send] fatal:', message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  schedule: '@hourly',
};
