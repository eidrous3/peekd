import crypto from 'crypto';
import { Resend } from 'resend';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'application/pdf']);

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export function supabaseUrl() {
  return (process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

export function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || '';
}

export function publicKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || serviceKey();
}

export function adminSecret() {
  return process.env.SUPPORT_ADMIN_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || 'peekd-dev-admin-secret';
}

export function adminEmail() {
  return (process.env.SUPPORT_ADMIN_EMAIL || 'hello@getpeekd.com').trim().toLowerCase();
}

export function adminPassword() {
  return process.env.SUPPORT_ADMIN_PASSWORD || '';
}

export async function getUserFromToken(accessToken) {
  const url = supabaseUrl();
  const key = publicKey();
  if (!url || !key || !accessToken) return null;

  const res = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) return null;
  return res.json();
}

export function bearerToken(req) {
  const auth = req.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

export function adminToken(req) {
  return req.headers.get('X-Admin-Token') || bearerToken(req);
}

export function signAdminToken() {
  const payload = {
    role: 'support_admin',
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', adminSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyAdminToken(token) {
  if (!token || !token.includes('.')) return false;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', adminSecret()).update(body).digest('base64url');
  if (sig !== expected) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.role !== 'support_admin') return false;
    if (!payload.exp || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export function sanitizeFilename(name) {
  return String(name || 'attachment')
    .replace(/[^\w.\-() ]+/g, '_')
    .slice(0, 180) || 'attachment';
}

export function parseAttachment(input) {
  if (!input || typeof input !== 'object') return { ok: true, attachment: null };
  const filename = sanitizeFilename(input.filename || input.name);
  const mimeType = String(input.mimeType || input.contentType || 'application/octet-stream').toLowerCase();
  const data = String(input.data || input.content || '').replace(/\s/g, '');
  if (!data) return { ok: true, attachment: null };
  if (!ALLOWED_MIMES.has(mimeType)) return { ok: false, error: 'invalid_attachment_type' };
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) return { ok: false, error: 'invalid_attachment' };
  const bytes = Math.floor((data.length * 3) / 4);
  if (bytes > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'attachment_too_large' };
  return { ok: true, attachment: { filename, mimeType, data, bytes } };
}

export async function uploadAttachment({ userId, ticketId, messageId, attachment }) {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key) return { ok: false, error: 'missing_config' };

  const storagePath = `${userId}/${ticketId}/${messageId}/${attachment.filename}`;
  const bytes = Buffer.from(attachment.data, 'base64');

  const res = await fetch(`${url}/storage/v1/object/ticket-attachments/${storagePath}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': attachment.mimeType,
      'x-upsert': 'true',
    },
    body: bytes,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, error: detail || 'upload_failed' };
  }

  return {
    ok: true,
    path: storagePath,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
  };
}

export async function signedAttachmentUrl(path, expiresIn = 3600) {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key || !path) return null;

  const res = await fetch(`${url}/storage/v1/object/sign/ticket-attachments/${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  });

  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  if (!data?.signedURL) return null;
  return data.signedURL.startsWith('http') ? data.signedURL : `${url}/storage/v1${data.signedURL}`;
}

export async function dbRequest(path, { method = 'GET', body, prefer } = {}) {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url || !key) return { ok: false, error: 'missing_config' };

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text().catch(() => '');
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!res.ok) {
    return { ok: false, error: data?.message || data?.error || text || 'db_error', data };
  }

  return { ok: true, data };
}

export function relativeTime(date) {
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return 'Just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 172_800_000) return 'Yesterday';
  if (ms < 604_800_000) return `${Math.floor(ms / 86_400_000)} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatMessageTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
}

export async function mapMessageRow(row) {
  const file = row.attachment_filename
    ? {
      name: row.attachment_filename,
      mimeType: row.attachment_mime || 'application/octet-stream',
      url: row.attachment_path ? await signedAttachmentUrl(row.attachment_path) : null,
    }
    : null;

  return {
    id: row.id,
    from: row.sender === 'admin' ? 'support' : 'you',
    name: row.sender_name || (row.sender === 'admin' ? 'Peekd Support' : 'You'),
    time: formatMessageTime(row.created_at),
    text: row.body || '',
    file,
  };
}

export async function mapTicketRow(row, { messages = null, includeMessages = false } = {}) {
  const ticket = {
    id: row.id,
    number: row.ticket_number,
    subject: row.subject,
    category: row.category,
    status: row.status,
    created: relativeTime(new Date(row.created_at)),
    createdAt: row.created_at,
    userEmail: row.user_email,
  };

  if (includeMessages && Array.isArray(messages)) {
    ticket.thread = await Promise.all(messages.map(mapMessageRow));
    const firstWithFile = messages.find((m) => m.attachment_filename);
    if (firstWithFile) {
      ticket.file = {
        name: firstWithFile.attachment_filename,
        url: firstWithFile.attachment_path ? await signedAttachmentUrl(firstWithFile.attachment_path) : null,
      };
    }
  }

  return ticket;
}

export async function fetchTicketMessages(ticketId) {
  const res = await dbRequest(
    `support_messages?ticket_id=eq.${encodeURIComponent(ticketId)}&order=created_at.asc&select=id,ticket_id,sender,sender_name,body,attachment_path,attachment_filename,attachment_mime,created_at`,
  );
  if (!res.ok) return [];
  return Array.isArray(res.data) ? res.data : [];
}

export function siteUrl() {
  const raw = process.env.URL || process.env.DEPLOY_URL || 'https://getpeekd.com';
  return String(raw).replace(/\/$/, '');
}

function escHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendTicketEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, error: 'email_not_configured' };

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

export async function notifyAdminNewTicket({ ticket, description, userEmail, attachmentName }) {
  const number = ticket.ticket_number;
  const subject = `[Peekd #${number}] New ticket: ${ticket.subject}`;
  const adminUrl = `${siteUrl()}/adming`;
  const lines = [
    `New support ticket from ${userEmail}`,
    `Category: ${ticket.category}`,
    `Ticket #${number}`,
    '',
    description,
  ];
  if (attachmentName) lines.push('', `Attachment: ${attachmentName}`);

  const text = `${lines.join('\n')}\n\nOpen admin: ${adminUrl}`;
  const html = [
    `<p><strong>New support ticket</strong> from ${escHtml(userEmail)}</p>`,
    `<p><strong>Category:</strong> ${escHtml(ticket.category)}<br>`,
    `<strong>Ticket:</strong> #${number}<br>`,
    `<strong>Subject:</strong> ${escHtml(ticket.subject)}</p>`,
    `<pre style="white-space:pre-wrap;font-family:inherit">${escHtml(description)}</pre>`,
    attachmentName ? `<p>Attachment: ${escHtml(attachmentName)}</p>` : '',
    `<p><a href="${escHtml(adminUrl)}">View in support admin</a></p>`,
  ].join('');

  return sendTicketEmail({
    to: adminEmail(),
    subject,
    html,
    text,
  });
}

export async function notifyAdminCustomerReply({ ticket, replyText, userEmail, attachmentName }) {
  const number = ticket.ticket_number;
  const subject = `[Peekd #${number}] Customer reply: ${ticket.subject}`;
  const adminUrl = `${siteUrl()}/adming`;
  const lines = [
    `Customer reply from ${userEmail}`,
    `Ticket #${number}: ${ticket.subject}`,
    '',
    replyText || '(See attachment in admin.)',
  ];
  if (attachmentName) lines.push('', `Attachment: ${attachmentName}`);

  const text = `${lines.join('\n')}\n\nOpen admin: ${adminUrl}`;
  const html = [
    `<p><strong>Customer reply</strong> from ${escHtml(userEmail)}</p>`,
    `<p><strong>Ticket:</strong> #${number}<br>`,
    `<strong>Subject:</strong> ${escHtml(ticket.subject)}</p>`,
    replyText ? `<pre style="white-space:pre-wrap;font-family:inherit">${escHtml(replyText)}</pre>` : '<p><em>See the attachment in admin.</em></p>',
    attachmentName ? `<p>Attachment: ${escHtml(attachmentName)}</p>` : '',
    `<p><a href="${escHtml(adminUrl)}">View in support admin</a></p>`,
  ].join('');

  return sendTicketEmail({
    to: adminEmail(),
    subject,
    html,
    text,
  });
}

export async function notifyCustomerAdminReply({ ticket, replyText, attachmentName }) {
  const email = String(ticket.user_email || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'no_customer_email' };

  const number = ticket.ticket_number;
  const subject = `Re: [Peekd #${number}] ${ticket.subject}`;
  const helpUrl = `${siteUrl()}/peekd%20dashboard?help=1`;
  const lines = [
    'Peekd Support replied to your ticket:',
    '',
    replyText || '(See attachment in your dashboard.)',
    '',
    `Ticket #${number}: ${ticket.subject}`,
    '',
    `View your ticket: ${helpUrl}`,
  ];
  const text = lines.join('\n');
  const html = [
    `<p>Peekd Support replied to your ticket <strong>#${number}</strong>:</p>`,
    replyText ? `<pre style="white-space:pre-wrap;font-family:inherit">${escHtml(replyText)}</pre>` : '<p><em>See the attachment in your dashboard.</em></p>',
    attachmentName ? `<p>Attachment: ${escHtml(attachmentName)}</p>` : '',
    `<p><a href="${escHtml(helpUrl)}">View your ticket in Peekd</a></p>`,
    `<p style="color:#666;font-size:13px">Subject: ${escHtml(ticket.subject)}</p>`,
  ].join('');

  return sendTicketEmail({
    to: email,
    subject,
    html,
    text,
  });
}
