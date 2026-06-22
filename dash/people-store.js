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

  window.PeekdPeople = {
    fetchPeople,
    createPerson,
    updatePerson,
    deletePerson,
    isEmail,
  };
})();
