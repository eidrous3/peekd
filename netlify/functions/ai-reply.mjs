import { cors, json, bearerToken, getUserFromToken } from './_support.mjs';
import { getConnectedAccounts } from './_accounts.mjs';
import { accountProvider, fetchProviderThreadForReply, getValidTokenForAccount } from './_providers.mjs';
import { loadActiveAiKey, requireProPlan } from './_ai-keys.mjs';
import { generateReplyText, textToHtml } from './_ai-reply.mjs';

function statusFor(error) {
  if (error === 'pro_required') return 403;
  if (error === 'no_ai_key' || error === 'ai_keys_missing') return 409;
  if (error === 'no_connected_account') return 404;
  if (error === 'keys_not_configured') return 503;
  return 502;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  const plan = await requireProPlan(user.id);
  if (!plan.ok) return json({ error: plan.error }, statusFor(plan.error));

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const messageId = String(body.messageId || '').trim();
  const threadId = String(body.threadId || '').trim();
  const accountEmail = String(body.accountEmail || '').trim().toLowerCase();
  if (!messageId && !threadId) return json({ error: 'message_id_required' }, 400);

  const key = await loadActiveAiKey(user.id);
  if (!key.ok) return json({ error: key.error }, statusFor(key.error));

  const accounts = await getConnectedAccounts(user.id, { email: accountEmail || undefined });
  const account = accounts[0];
  if (!account) return json({ error: 'no_connected_account' }, 404);

  const accessToken = await getValidTokenForAccount(account);
  if (!accessToken) return json({ error: 'token_refresh_failed' }, 502);

  const thread = await fetchProviderThreadForReply(accountProvider(account), accessToken, {
    threadId,
    messageId,
  });
  if (!thread.ok || !thread.messages?.length) {
    return json({ error: thread.error || 'thread_unavailable' }, 502);
  }

  const drafted = await generateReplyText(key, thread.messages);
  if (!drafted.ok) return json({ error: drafted.error }, 502);

  return json({
    ok: true,
    text: drafted.text,
    html: textToHtml(drafted.text),
    provider: key.provider,
  });
};
