import { saveConnectedAccount } from './_accounts.mjs';
import { dashboardUrl, decodeState } from './_oauth.mjs';
import {
  exchangeOutlookCode,
  fetchOutlookEmail,
  outlookRedirectUri,
  OUTLOOK_SCOPES,
} from './_outlook.mjs';

function fail(req) {
  return Response.redirect(dashboardUrl(req, { settings: 'integrations', outlook: 'error' }), 302);
}

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');

  if (url.searchParams.get('error')) return fail(req);

  const state = decodeState(stateRaw);
  if (!code || !state?.uid) return fail(req);

  const tokenResult = await exchangeOutlookCode(code, outlookRedirectUri(req));
  if (!tokenResult.ok) {
    console.error('[outlook-callback] token exchange failed:', tokenResult.error);
    return fail(req);
  }

  const email = await fetchOutlookEmail(tokenResult.tokens.access_token);
  if (!email) return fail(req);

  const saved = await saveConnectedAccount({
    userId: state.uid,
    email,
    tokens: tokenResult.tokens,
    provider: 'outlook',
    scopes: OUTLOOK_SCOPES,
  });

  if (!saved.ok) {
    console.error('[outlook-callback] save failed:', saved.error);
    return fail(req);
  }

  return Response.redirect(dashboardUrl(req, { settings: 'integrations', outlook: 'connected' }), 302);
};
