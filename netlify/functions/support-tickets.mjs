import {
  bearerToken,
  cors,
  dbRequest,
  fetchTicketMessages,
  getUserFromToken,
  json,
  mapTicketRow,
  notifyAdminNewTicket,
  parseAttachment,
  uploadAttachment,
} from './_support.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const token = bearerToken(req);
  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Unauthorized' }, 401);

  if (req.method === 'GET') {
    const res = await dbRequest(
      `support_tickets?user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&select=id,ticket_number,user_id,user_email,subject,category,status,created_at`,
    );
    if (!res.ok) return json({ ok: false, error: res.error }, 502);

    const tickets = await Promise.all((res.data || []).map((row) => mapTicketRow(row)));
    return json({ ok: true, tickets });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const subject = String(body.subject || '').trim();
  const category = String(body.category || body.cat || 'Other').trim() || 'Other';
  const description = String(body.description || body.desc || '').trim();
  const parsedAttachment = parseAttachment(body.attachment);

  if (!subject) return json({ error: 'subject_required' }, 400);
  if (!description) return json({ error: 'description_required' }, 400);
  if (!parsedAttachment.ok) return json({ error: parsedAttachment.error }, 400);

  const userEmail = (user.email || '').trim().toLowerCase();
  const ticketRes = await dbRequest('support_tickets', {
    method: 'POST',
    body: {
      user_id: user.id,
      user_email: userEmail,
      subject,
      category,
      status: 'open',
    },
    prefer: 'return=representation',
  });

  if (!ticketRes.ok || !ticketRes.data?.[0]) {
    return json({ ok: false, error: ticketRes.error || 'create_failed' }, 502);
  }

  const ticket = ticketRes.data[0];
  const messageRes = await dbRequest('support_messages', {
    method: 'POST',
    body: {
      ticket_id: ticket.id,
      sender: 'user',
      sender_name: 'You',
      body: description,
    },
    prefer: 'return=representation',
  });

  if (!messageRes.ok || !messageRes.data?.[0]) {
    return json({ ok: false, error: messageRes.error || 'message_failed' }, 502);
  }

  let message = messageRes.data[0];

  if (parsedAttachment.attachment) {
    const uploaded = await uploadAttachment({
      userId: user.id,
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

  const messages = await fetchTicketMessages(ticket.id);
  const uiTicket = await mapTicketRow(ticket, { messages, includeMessages: true });

  try {
    const notify = await notifyAdminNewTicket({
      ticket,
      description,
      userEmail,
      attachmentName: message.attachment_filename || null,
    });
    if (!notify.ok) console.error('[support] admin email failed:', notify.error);
  } catch (err) {
    console.error('[support] admin email failed:', err);
  }

  return json({ ok: true, ticket: uiTicket });
};
