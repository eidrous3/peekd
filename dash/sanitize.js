// Email sanitization and safe display for login/signup.
(function () {
  const LOCAL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
  const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

  function stripInvisible(value) {
    return value
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .trim();
  }

  function sanitizeEmail(raw) {
    if (raw == null || typeof raw !== 'string') {
      return { ok: false, error: 'Please enter your email address' };
    }

    const email = stripInvisible(raw).toLowerCase();
    if (!email) return { ok: false, error: 'Please enter your email address' };
    if (email.length > 254) return { ok: false, error: 'Email address is too long' };

    const parts = email.split('@');
    if (parts.length !== 2) return { ok: false, error: 'Please enter a valid email address' };

    const [local, domain] = parts;
    if (!local || !domain || local.length > 64 || domain.length > 255) {
      return { ok: false, error: 'Please enter a valid email address' };
    }
    if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
      return { ok: false, error: 'Please enter a valid email address' };
    }
    if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..') || !domain.includes('.')) {
      return { ok: false, error: 'Please enter a valid email address' };
    }
    if (!LOCAL_RE.test(local) || !DOMAIN_RE.test(domain)) {
      return { ok: false, error: 'Please enter a valid email address' };
    }

    return { ok: true, email };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatAuthError(err) {
    const msg = ((err && err.message) || String(err || '')).trim();
    if (/rate limit/i.test(msg)) {
      return 'Too many attempts. Please wait a few minutes, then try again.';
    }
    if (/invalid email/i.test(msg)) return 'Please enter a valid email address.';
    if (/signup.*disabled|signups not allowed/i.test(msg)) {
      return 'Sign up is unavailable. Try signing in with an existing account.';
    }
    if (/user not found|no user/i.test(msg)) {
      return 'No account found for this email. Try signing up instead.';
    }
    return msg || 'Something went wrong. Please try again.';
  }

  window.PeekdSanitize = { sanitizeEmail, escapeHtml, formatAuthError };
})();
