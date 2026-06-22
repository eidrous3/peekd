(function () {
  const PUBLIC_COLUMNS = 'id, first_name, last_name, email, company, list_id, created_at';

  async function session() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return null;
    return Auth.ensureSession();
  }

  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
  }

  function initials(first, last, email) {
    const f = String(first || '').trim();
    const l = String(last || '').trim();
    if (f && l) return (f[0] + l[0]).toUpperCase();
    if (f) return f.slice(0, 2).toUpperCase();
    const e = String(email || '').trim();
    return e ? e.slice(0, 2).toUpperCase() : '?';
  }

  function fullName(first, last) {
    return [String(first || '').trim(), String(last || '').trim()].filter(Boolean).join(' ') || 'Contact';
  }

  function toUiPerson(row) {
    const first = row.first_name || '';
    const last = row.last_name || '';
    return {
      id: row.id,
      firstName: first,
      lastName: last,
      name: fullName(first, last),
      email: row.email || '',
      company: row.company || '',
      listId: row.list_id || null,
      initials: initials(first, last, row.email),
      sent: 0,
      rate: 0,
      dot: 'r',
      last: '—',
      status: 'ACTIVE',
    };
  }

  function normalizeInput(input) {
    const firstName = String(input.firstName ?? input.first_name ?? '').trim();
    const lastName = String(input.lastName ?? input.last_name ?? '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const company = String(input.company || '').trim() || null;
    const listId = input.listId || input.list_id || null;
    return { firstName, lastName, email, company, listId };
  }

  async function fetchPeople() {
    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session', people: [] };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured', people: [] };

    const { data, error } = await sb
      .from('people')
      .select(PUBLIC_COLUMNS)
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false });

    if (error) return { ok: false, error: error.message, people: [] };

    return {
      ok: true,
      people: (data || []).map(toUiPerson),
    };
  }

  async function createPerson(input) {
    const { firstName, lastName, email, company, listId } = normalizeInput(input);
    if (!email) return { ok: false, error: 'email_required' };
    if (!isEmail(email)) return { ok: false, error: 'invalid_email' };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { data, error } = await sb
      .from('people')
      .insert({
        user_id: s.user.id,
        first_name: firstName,
        last_name: lastName,
        email,
        company,
        list_id: listId || null,
      })
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) {
      if (error.code === '23505') return { ok: false, error: 'duplicate_email' };
      return { ok: false, error: error.message };
    }

    return { ok: true, person: toUiPerson(data) };
  }

  async function updatePerson(id, input) {
    if (!id) return { ok: false, error: 'invalid_input' };

    const { firstName, lastName, email, company, listId } = normalizeInput(input);
    if (!email) return { ok: false, error: 'email_required' };
    if (!isEmail(email)) return { ok: false, error: 'invalid_email' };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { data, error } = await sb
      .from('people')
      .update({
        first_name: firstName,
        last_name: lastName,
        email,
        company,
        list_id: listId || null,
      })
      .eq('id', id)
      .eq('user_id', s.user.id)
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) {
      if (error.code === '23505') return { ok: false, error: 'duplicate_email' };
      return { ok: false, error: error.message };
    }

    return { ok: true, person: toUiPerson(data) };
  }

  async function deletePerson(id) {
    if (!id) return { ok: false, error: 'invalid_input' };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { error } = await sb
      .from('people')
      .delete()
      .eq('id', id)
      .eq('user_id', s.user.id);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  function nameFromEmailLocal(email) {
    const local = String(email || '').split('@')[0] || '';
    return local.replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim();
  }

  function splitDisplayName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  function normalizeContactList(input) {
    const map = new Map();
    for (const item of Array.isArray(input) ? input : []) {
      if (typeof item === 'string') {
        const email = String(item || '').trim().toLowerCase();
        if (!isEmail(email)) continue;
        map.set(email, map.get(email) || { email, firstName: '', lastName: '' });
      } else if (item && typeof item === 'object') {
        const email = String(item.email || '').trim().toLowerCase();
        if (!isEmail(email)) continue;
        const existing = map.get(email) || { email, firstName: '', lastName: '' };
        const firstName = String(item.firstName ?? item.first_name ?? existing.firstName ?? '').trim();
        const lastName = String(item.lastName ?? item.last_name ?? existing.lastName ?? '').trim();
        map.set(email, {
          email,
          firstName: firstName || existing.firstName,
          lastName: lastName || existing.lastName,
        });
      }
    }
    return [...map.values()];
  }

  async function ensurePeopleFromEmails(emailsOrContacts) {
    const contacts = normalizeContactList(emailsOrContacts);
    if (!contacts.length) return { ok: true, added: [], skipped: [] };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const added = [];
    const skipped = [];

    for (const contact of contacts) {
      const email = contact.email;
      const { data: existing, error: lookupError } = await sb
        .from('people')
        .select('id')
        .eq('user_id', s.user.id)
        .eq('email', email)
        .maybeSingle();

      if (lookupError) return { ok: false, error: lookupError.message, added, skipped };
      if (existing) {
        skipped.push(email);
        continue;
      }

      const firstName = contact.firstName || nameFromEmailLocal(email);
      const lastName = contact.lastName || '';

      const { data, error } = await sb
        .from('people')
        .insert({
          user_id: s.user.id,
          first_name: firstName,
          last_name: lastName,
          email,
          company: null,
          list_id: null,
        })
        .select(PUBLIC_COLUMNS)
        .single();

      if (error) {
        if (error.code === '23505') {
          skipped.push(email);
          continue;
        }
        return { ok: false, error: error.message, added, skipped };
      }

      added.push(toUiPerson(data));
    }

    return { ok: true, added, skipped };
  }

  async function ensurePeopleFromInboxMessages(messages, { excludeEmails = [] } = {}) {
    const excluded = new Set(
      (Array.isArray(excludeEmails) ? excludeEmails : [])
        .map((e) => String(e || '').trim().toLowerCase())
        .filter(Boolean),
    );

    const contacts = [];
    for (const msg of messages || []) {
      const labels = msg.gmailLabelIds || [];
      const inSent = labels.includes('SENT');
      const inInbox = labels.includes('INBOX');
      if (inSent && !inInbox) continue;

      const email = String(msg.email || msg.from || '').trim().toLowerCase();
      if (!isEmail(email) || excluded.has(email)) continue;

      const { firstName, lastName } = splitDisplayName(msg.name);
      contacts.push({ email, firstName, lastName });
    }

    return ensurePeopleFromEmails(contacts);
  }

  window.PeekdPeople = {
    fetchPeople,
    createPerson,
    updatePerson,
    deletePerson,
    ensurePeopleFromEmails,
    ensurePeopleFromInboxMessages,
    isEmail,
  };
})();
