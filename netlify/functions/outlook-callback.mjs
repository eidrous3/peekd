import { saveConnectedAccount } from './_accounts.mjs';
import { dashboardUrl, decodeState } from './_oauth.mjs';
import {
  exchangeOutlookCode,
  outlookRedirectUri,
  resolveOutlookEmail,
  OUTLOOK_SCOPES,
} from './_outlook.mjs';

function fail(req, reason) {
  console.error('[outlook-callback] failed:', reason);
  return Response.redirect(dashboardUrl(req, { settings: 'integrations', outlook: 'error' }), 302);
}

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');

  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    return fail(req, `${oauthError}: ${url.searchParams.get('error_description') || ''}`);
  }

  const state = decodeState(stateRaw);
  if (!code) return fail(req, 'missing_code');
  if (!state?.uid) return fail(req, 'invalid_or_expired_state');

  const tokenResult = await exchangeOutlookCode(code, outlookRedirectUri(req));
  if (!tokenResult.ok) {
    return fail(req, `token_exchange_failed: ${tokenResult.error}`);
  }

  const email = await resolveOutlookEmail(tokenResult.tokens);
  if (!email) return fail(req, 'could_not_resolve_mailbox_address');

  const saved = await saveConnectedAccount({
    userId: state.uid,
    email,
    tokens: tokenResult.tokens,
    provider: 'outlook',
    scopes: OUTLOOK_SCOPES,
  });

  if (!saved.ok) return fail(req, `save_failed: ${saved.error}`);

  return Response.redirect(dashboardUrl(req, { settings: 'integrations', outlook: 'connected' }), 302);
};
