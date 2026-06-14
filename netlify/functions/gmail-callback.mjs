import {
  decodeState,
  dashboardUrl,
  exchangeCodeForTokens,
  fetchGoogleEmail,
  gmailRedirectUri,
  saveConnectedAccount,
} from './_gmail.mjs';

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return Response.redirect(dashboardUrl(req, { settings: 'integrations', gmail: 'error' }), 302);
  }

  const state = decodeState(stateRaw);
  if (!code || !state?.uid) {
    return Response.redirect(dashboardUrl(req, { settings: 'integrations', gmail: 'error' }), 302);
  }

  const redirectUri = gmailRedirectUri(req);
  const tokenResult = await exchangeCodeForTokens(code, redirectUri);
  if (!tokenResult.ok) {
    return Response.redirect(dashboardUrl(req, { settings: 'integrations', gmail: 'error' }), 302);
  }

  const email = await fetchGoogleEmail(tokenResult.tokens.access_token);
  if (!email) {
    return Response.redirect(dashboardUrl(req, { settings: 'integrations', gmail: 'error' }), 302);
  }

  const saved = await saveConnectedAccount({
    userId: state.uid,
    email,
    tokens: tokenResult.tokens,
  });

  if (!saved.ok) {
    return Response.redirect(dashboardUrl(req, { settings: 'integrations', gmail: 'error' }), 302);
  }

  return Response.redirect(dashboardUrl(req, { settings: 'integrations', gmail: 'connected' }), 302);
};
