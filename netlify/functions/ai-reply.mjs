import { cors, json, bearerToken, getUserFromToken } from './_support.mjs';
import { getConnectedAccounts } from './_accounts.mjs';
import { accountProvider, fetchProviderThreadForReply, getValidTokenForAccount } from './_providers.mjs';
import { loadActiveAiKey, requireProPlan } from './_ai-keys.mjs';
import { generateReplyText, textToHtml } from './_ai-reply.mjs';

function statusFor(error) {
  if (error === 'pro_required') return 403;
  if (error === 'no_ai_key' || error === 'ai_keys_missing' || error === 'invalid_ai_key') return 409;
  if (error === 'no_connected_account') return 404;
  if (error === 'keys_not_configured') return 503;
  if (error === 'message_id_required' || error === 'Invalid JSON') return 400;
  return 502;
}

function previewMessages(body) {
  const preview = String(body.preview || '').trim();
  const subject = String(body.subject || '').trim();
  if (!preview && !subject) return [];
  const from = String(body.fromEmail || body.from || '').trim();
  const text = [subject && `Subject: ${subject}`, preview].filter(Boolean).join('\n\n');
  return [{ from, date: '', text: text.slice(0, 4000) }];
}

async function handle(req) {
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
  const messages = (thread.ok && thread.messages?.length)
    ? thread.messages
    : previewMessages(body);
  if (!messages.length) {
    return json({ error: thread.error || 'thread_unavailable' }, 502);
  }

  const drafted = await generateReplyText(key, messages);
  if (!drafted.ok) return json({ error: drafted.error }, statusFor(drafted.error));

  return json({
    ok: true,
    text: drafted.text,
    html: textToHtml(drafted.text),
    provider: key.provider,
  });
}

export default async (req) => {
  try {
    return await handle(req);
  } catch {
    return json({ error: 'generate_failed' }, 502);
  }
};
