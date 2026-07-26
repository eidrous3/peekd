import { publishDueCampaignSteps } from './_campaigns.mjs';

/**
 * Hourly cron: publish past-due campaign steps on active campaigns.
 * Invoked by Netlify Scheduled Functions (no auth header).
 */
export default async () => {
  const started = Date.now();
  console.log('[campaign-send-due] starting');

  try {
    const summary = await publishDueCampaignSteps({ now: new Date(), limit: 25 });
    const body = {
      ...summary,
      elapsedMs: Date.now() - started,
    };
    console.log('[campaign-send-due] done', JSON.stringify(body));
    return new Response(JSON.stringify(body), {
      status: summary.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err?.message || String(err);
    console.error('[campaign-send-due] fatal:', message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  schedule: '@hourly',
};
