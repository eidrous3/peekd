import { getUserFromToken } from './_gmail.mjs';
import { getConnectedAccounts } from './_accounts.mjs';
import { syncRepliesForProvider } from './_providers.mjs';
import { dbRequest } from './_support.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function postgrestInFilter(values) {
  return `(${values.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',')})`;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Invalid session' }, 401);

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const campaignIds = Array.isArray(body.campaignIds)
    ? body.campaignIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const subjects = Array.isArray(body.subjects)
    ? [...new Set(body.subjects.map((s) => String(s || '').trim()).filter(Boolean))]
    : [];

  const selectWithCampaign = [
    'id',
    'from_email',
    'provider',
    'gmail_message_id',
    'gmail_thread_id',
    'sent_at',
    'subject',
    'campaign_id',
    'tracked_recipients(email,is_replied,replied_at)',
  ].join(',');
  const selectBase = [
    'id',
    'from_email',
    'provider',
    'gmail_message_id',
    'gmail_thread_id',
    'sent_at',
    'subject',
    'tracked_recipients(email,is_replied,replied_at)',
  ].join(',');

  const byId = new Map();

  async function load(query) {
    const res = await dbRequest(query);
    if (!res.ok || !Array.isArray(res.data)) return { ok: false, error: res.error };
    for (const row of res.data) byId.set(row.id, row);
    return { ok: true };
  }

  if (campaignIds.length) {
    const linked = await load(
      `tracked_emails?user_id=eq.${encodeURIComponent(user.id)}`
        + `&campaign_id=in.${postgrestInFilter(campaignIds)}`
        + `&gmail_thread_id=not.is.null`
        + `&gmail_message_id=not.is.null`
        + `&select=${encodeURIComponent(selectWithCampaign)}`
        + `&limit=200`,
    );
    if (!linked.ok && !/campaign_id/.test(linked.error || '')) {
      return json({ ok: false, error: linked.error || 'fetch_failed' }, 502);
    }
  }

  if (subjects.length) {
    await load(
      `tracked_emails?user_id=eq.${encodeURIComponent(user.id)}`
        + `&subject=in.${postgrestInFilter(subjects)}`
        + `&gmail_thread_id=not.is.null`
        + `&gmail_message_id=not.is.null`
        + `&select=${encodeURIComponent(selectBase)}`
        + `&order=sent_at.desc`
        + `&limit=200`,
    );
  }

  if (!byId.size) {
    await load(
      `tracked_emails?user_id=eq.${encodeURIComponent(user.id)}`
        + `&gmail_thread_id=not.is.null`
        + `&gmail_message_id=not.is.null`
        + `&select=${encodeURIComponent(selectBase)}`
        + `&order=sent_at.desc`
        + `&limit=100`,
    );
  }

  const accounts = await getConnectedAccounts(user.id);
  if (!accounts.length) {
    return json({ ok: true, updated: 0, reason: 'no_connected_account' });
  }

  const sync = await syncRepliesForProvider(user.id, [...byId.values()]);
  return json({ ok: true, updated: sync.updated || 0 });
};
