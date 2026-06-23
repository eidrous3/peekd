import {
  bearerToken,
  cors,
  dbRequest,
  fetchTicketMessages,
  getUserFromToken,
  json,
  mapMessageRow,
  mapTicketRow,
  parseAttachment,
  uploadAttachment,
} from './_support.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const token = bearerToken(req);
  const user = await getUserFromToken(token);
  if (!user?.id) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(req.url);
  const ticketId = url.searchParams.get('id') || '';
  if (!ticketId) return json({ error: 'id_required' }, 400);

  const ticketRes = await dbRequest(
    `support_tickets?id=eq.${encodeURIComponent(ticketId)}&user_id=eq.${encodeURIComponent(user.id)}&select=id,ticket_number,user_id,user_email,subject,category,status,created_at`,
  );
  if (!ticketRes.ok) return json({ ok: false, error: ticketRes.error }, 502);
  const ticket = ticketRes.data?.[0];
  if (!ticket) return json({ error: 'not_found' }, 404);

  if (req.method === 'GET') {
    const messages = await fetchTicketMessages(ticket.id);
    const uiTicket = await mapTicketRow(ticket, { messages, includeMessages: true });
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
  if (!text && !parsedAttachment.attachment) return json({ error: 'message_required' }, 400);
  if (!parsedAttachment.ok) return json({ error: parsedAttachment.error }, 400);

  const messageRes = await dbRequest('support_messages', {
    method: 'POST',
    body: {
      ticket_id: ticket.id,
      sender: 'user',
      sender_name: 'You',
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

  await dbRequest(`support_tickets?id=eq.${encodeURIComponent(ticket.id)}`, {
    method: 'PATCH',
    body: { status: 'open' },
  });

  const uiMessage = await mapMessageRow(message);
  return json({ ok: true, message: uiMessage });
};
