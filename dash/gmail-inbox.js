(function () {
  const INBOX_CACHE_PREFIX = 'peekd_inbox_v1:';

  async function session() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return null;
    return Auth.ensureSession();
  }

  function cacheAccountKey(accountEmail) {
    return accountEmail && accountEmail !== 'all' ? String(accountEmail).trim().toLowerCase() : 'all';
  }

  function inboxCacheKey(userId, accountEmail) {
    return INBOX_CACHE_PREFIX + userId + ':' + cacheAccountKey(accountEmail);
  }

  async function readInboxCache(accountEmail) {
    const s = await session();
    if (!s?.user?.id) return null;
    try {
      const raw = localStorage.getItem(inboxCacheKey(s.user.id, accountEmail));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.messages)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async function writeInboxCache(accountEmail, payload) {
    const s = await session();
    if (!s?.user?.id) return;
    try {
      localStorage.setItem(inboxCacheKey(s.user.id, accountEmail), JSON.stringify({
        messages: payload.messages || [],
        accounts: payload.accounts || [],
        savedAt: Date.now(),
      }));
    } catch { /* quota / private mode */ }
  }

  async function fetchInbox({ accountEmail, labelIds, maxResults, enrichReplies, messages } = {}) {
    const s = await session();
    if (!s?.access_token) return { ok: false, error: 'no_session', messages: [] };

    const body = { accountEmail, labelIds, maxResults };
    if (enrichReplies === true) body.enrichReplies = true;
    if (enrichReplies === true && Array.isArray(messages) && messages.length) {
      body.messages = messages;
    }

    const res = await fetch('/.netlify/functions/gmail-messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || 'fetch_failed',
        messages: [],
        accounts: data.accounts || [],
      };
    }

    return {
      ok: true,
      messages: data.messages || [],
      accounts: data.accounts || [],
    };
  }

  async function fetchMailboxCount() {
    const s = await session();
    if (!s?.access_token) return { ok: false, error: 'no_session', inbox: 0 };

    const res = await fetch('/.netlify/functions/mailbox-counts', {
      method: 'GET',
      headers: { Authorization: `Bearer ${s.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'fetch_failed', inbox: 0 };
    }
    return { ok: true, inbox: Number(data.inbox) || 0 };
  }

  async function fetchMessageBody({ messageId, accountEmail } = {}) {
    const s = await session();
    if (!s?.access_token) return { ok: false, error: 'no_session' };

    const res = await fetch('/.netlify/functions/mail-message', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messageId, accountEmail }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'fetch_failed' };
    return data;
  }

  async function sendEmail({ fromEmail, to, subject, html, addBranding, trackLinks, attachments, campaignId, campaignStepId, reply }) {
    const s = await session();
    if (!s?.access_token) return { ok: false, error: 'no_session' };

    const recipients = (Array.isArray(to) ? to : [])
      .map((e) => String(e).trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    const res = await fetch('/.netlify/functions/gmail-send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fromEmail,
        to: recipients,
        subject: String(subject || '').trim(),
        html: String(html || '').trim(),
        track: true,
        trackLinks: trackLinks === true,
        addBranding: !!addBranding,
        campaignId: campaignId || null,
        campaignStepId: campaignStepId || null,
        inReplyTo: reply?.inReplyTo || null,
        references: reply?.references || null,
        threadId: reply?.threadId || null,
        replyToMessageId: reply?.replyToMessageId || null,
        attachments: Array.isArray(attachments)
          ? attachments.map((a) => ({
            filename: a.filename || a.name,
            mimeType: a.mimeType || a.contentType || 'application/octet-stream',
            data: a.data,
          }))
          : [],
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'send_failed' };
    }

    return { ok: true, messageId: data.messageId, threadId: data.threadId };
  }

  window.PeekdGmail = { fetchInbox, fetchMailboxCount, fetchMessageBody, sendEmail, readInboxCache, writeInboxCache };
})();
