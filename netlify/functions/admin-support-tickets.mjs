import {
  adminToken,
  cors,
  dbRequest,
  fetchTicketMessages,
  json,
  mapMessageRow,
  mapTicketRow,
  notifyCustomerAdminReply,
  parseAttachment,
  uploadAttachment,
  verifyAdminToken,
} from './_support.mjs';

function requireAdmin(req) {
  const token = adminToken(req);
  if (!verifyAdminToken(token)) return null;
  return token;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!requireAdmin(req)) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(req.url);
  const ticketId = url.searchParams.get('id') || '';

  if (req.method === 'GET' && !ticketId) {
    const res = await dbRequest(
      'support_tickets?order=created_at.desc&select=id,ticket_number,user_id,user_email,subject,category,status,created_at',
    );
    if (!res.ok) return json({ ok: false, error: res.error }, 502);
    const tickets = await Promise.all((res.data || []).map((row) => mapTicketRow(row)));
    return json({ ok: true, tickets });
  }

  if (!ticketId) return json({ error: 'id_required' }, 400);

  const ticketRes = await dbRequest(
    `support_tickets?id=eq.${encodeURIComponent(ticketId)}&select=id,ticket_number,user_id,user_email,subject,category,status,created_at`,
  );
  if (!ticketRes.ok) return json({ ok: false, error: ticketRes.error }, 502);
  const ticket = ticketRes.data?.[0];
  if (!ticket) return json({ error: 'not_found' }, 404);

  if (req.method === 'GET') {
    const messages = await fetchTicketMessages(ticket.id);
    const uiTicket = await mapTicketRow(ticket, { messages, includeMessages: true });
    return json({ ok: true, ticket: uiTicket });
  }

  if (req.method === 'PATCH') {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const status = String(body.status || '').trim();
    const allowed = ['open', 'progress', 'resolved'];
    if (!allowed.includes(status)) return json({ error: 'invalid_status' }, 400);

    const patch = await dbRequest(`support_tickets?id=eq.${encodeURIComponent(ticket.id)}`, {
      method: 'PATCH',
      body: { status },
      prefer: 'return=representation',
    });
    if (!patch.ok || !patch.data?.[0]) return json({ ok: false, error: patch.error }, 502);
    const messages = await fetchTicketMessages(ticket.id);
    const uiTicket = await mapTicketRow(patch.data[0], { messages, includeMessages: true });
    return json({ ok: true, ticket: uiTicket });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const text = String(body.text || body.body || '').trim();
  const parsedAttachment = parseAttachment(body.attachment);
  const status = String(body.status || 'progress').trim();
  if (!text && !parsedAttachment.attachment) return json({ error: 'message_required' }, 400);
  if (!parsedAttachment.ok) return json({ error: parsedAttachment.error }, 400);

  const messageRes = await dbRequest('support_messages', {
    method: 'POST',
    body: {
      ticket_id: ticket.id,
      sender: 'admin',
      sender_name: String(body.senderName || 'Peekd Support').trim() || 'Peekd Support',
      body: text,
    },
    prefer: 'return=representation',
  });

  if (!messageRes.ok || !messageRes.data?.[0]) {
    return json({ ok: false, error: messageRes.error || 'reply_failed' }, 502);
  }

  let message = messageRes.data[0];

  if (parsedAttachment.attachment) {
    const uploaded = await uploadAttachment({
      userId: ticket.user_id,
      ticketId: ticket.id,
      messageId: message.id,
      attachment: parsedAttachment.attachment,
    });
    if (!uploaded.ok) return json({ ok: false, error: uploaded.error }, 502);

    const patch = await dbRequest(`support_messages?id=eq.${encodeURIComponent(message.id)}`, {
      method: 'PATCH',
      body: {
        attachment_path: uploaded.path,
        attachment_filename: uploaded.filename,
        attachment_mime: uploaded.mimeType,
      },
      prefer: 'return=representation',
    });
    if (patch.ok && patch.data?.[0]) message = patch.data[0];
  }

  if (['open', 'progress', 'resolved'].includes(status)) {
    await dbRequest(`support_tickets?id=eq.${encodeURIComponent(ticket.id)}`, {
      method: 'PATCH',
      body: { status },
    });
  }

  try {
    const notify = await notifyCustomerAdminReply({
      ticket,
      replyText: text,
      attachmentName: message.attachment_filename || null,
    });
    if (!notify.ok) console.error('[support] customer email failed:', notify.error);
  } catch (err) {
    console.error('[support] customer email failed:', err);
  }

  const uiMessage = await mapMessageRow(message);
  return json({ ok: true, message: uiMessage });
};
