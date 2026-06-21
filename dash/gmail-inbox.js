(function () {
  async function session() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return null;
    return Auth.ensureSession();
  }

  async function fetchInbox({ accountEmail, labelIds, maxResults } = {}) {
    const s = await session();
    if (!s?.access_token) return { ok: false, error: 'no_session', messages: [] };

    const res = await fetch('/.netlify/functions/gmail-messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accountEmail, labelIds, maxResults }),
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

  async function sendEmail({ fromEmail, to, subject, html, addBranding }) {
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
        addBranding: !!addBranding,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'send_failed' };
    }

    return { ok: true, messageId: data.messageId, threadId: data.threadId };
  }

  window.PeekdGmail = { fetchInbox, sendEmail };
})();
