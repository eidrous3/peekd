/** Display formatting shared by every mail provider's inbox mapping. */

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function parseEmailHeader(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?$/);
  if (m) return { name: (m[1] || m[2].split('@')[0] || '').trim(), email: m[2].trim().toLowerCase() };
  return { name: s.split('@')[0] || 'Unknown', email: s.toLowerCase() };
}

export function headerValue(headers, name) {
  const h = (headers || []).find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

export function initials(name, email) {
  const n = (name || '').trim();
  if (n && n !== email) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const e = (email || '').trim();
  return e ? e.slice(0, 2).toUpperCase() : '?';
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

export function formatSentAt(date) {
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

export function isAutomatedReplyEmail(email) {
  return /^(mailer-daemon|postmaster|noreply|no-reply|donotreply|do-not-reply)@/i.test(normalizeEmail(email));
}
