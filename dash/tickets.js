(function () {
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'application/pdf']);

  async function session() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return null;
    return Auth.ensureSession();
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function filePayload(file) {
    if (!file) return null;
    if (file.size > MAX_FILE_BYTES) return { ok: false, error: 'attachment_too_large' };
    const mimeType = (file.type || 'application/octet-stream').toLowerCase();
    if (!ALLOWED_TYPES.has(mimeType)) return { ok: false, error: 'invalid_attachment_type' };
    const data = await readFileAsBase64(file);
    return {
      ok: true,
      attachment: { filename: file.name, mimeType, data },
    };
  }

  async function fetchTickets() {
    const s = await session();
    if (!s?.access_token) return { ok: false, error: 'no_session', tickets: [] };

    const res = await fetch('/.netlify/functions/support-tickets', {
      headers: { Authorization: `Bearer ${s.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'fetch_failed', tickets: [] };
    return { ok: true, tickets: data.tickets || [] };
  }

  async function fetchTicket(id) {
    const s = await session();
    if (!s?.access_token) return { ok: false, error: 'no_session' };

    const res = await fetch(`/.netlify/functions/support-ticket?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${s.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'fetch_failed' };
    return { ok: true, ticket: data.ticket };
  }

  async function createTicket({ subject, category, description, file }) {
    const s = await session();
    if (!s?.access_token) return { ok: false, error: 'no_session' };

    const attachmentRes = file ? await filePayload(file) : { ok: true, attachment: null };
    if (!attachmentRes.ok) return attachmentRes;

    const res = await fetch('/.netlify/functions/support-tickets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject,
        category,
        description,
        attachment: attachmentRes.attachment,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'create_failed' };
    return { ok: true, ticket: data.ticket };
  }

  async function replyToTicket(id, { text, file }) {
    const s = await session();
    if (!s?.access_token) return { ok: false, error: 'no_session' };

    const attachmentRes = file ? await filePayload(file) : { ok: true, attachment: null };
    if (!attachmentRes.ok) return attachmentRes;

    const res = await fetch(`/.netlify/functions/support-ticket?id=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        attachment: attachmentRes.attachment,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'reply_failed' };
    return { ok: true, message: data.message };
  }

  window.PeekdTickets = {
    fetchTickets,
    fetchTicket,
    createTicket,
    replyToTicket,
    MAX_FILE_BYTES,
  };
})();
