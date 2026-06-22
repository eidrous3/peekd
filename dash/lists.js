(function () {
  const PUBLIC_COLUMNS = 'id, name, created_at';

  async function session() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return null;
    return Auth.ensureSession();
  }

  function formatCreated(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function toUiList(row) {
    return {
      id: row.id,
      name: row.name,
      created: formatCreated(row.created_at),
      count: 0,
      sent: 0,
      rate: 0,
      dot: 'r',
      last: '—',
    };
  }

  async function fetchLists() {
    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session', lists: [] };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured', lists: [] };

    const { data, error } = await sb
      .from('lists')
      .select(PUBLIC_COLUMNS)
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false });

    if (error) return { ok: false, error: error.message, lists: [] };

    return {
      ok: true,
      lists: (data || []).map(toUiList),
    };
  }

  async function createList(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, error: 'name_required' };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { data, error } = await sb
      .from('lists')
      .insert({ user_id: s.user.id, name: trimmed })
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) {
      if (error.code === '23505') return { ok: false, error: 'duplicate_name' };
      return { ok: false, error: error.message };
    }

    return { ok: true, list: toUiList(data) };
  }

  async function updateList(id, name) {
    const trimmed = String(name || '').trim();
    if (!id || !trimmed) return { ok: false, error: 'invalid_input' };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { data, error } = await sb
      .from('lists')
      .update({ name: trimmed })
      .eq('id', id)
      .eq('user_id', s.user.id)
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) {
      if (error.code === '23505') return { ok: false, error: 'duplicate_name' };
      return { ok: false, error: error.message };
    }

    return { ok: true, list: toUiList(data) };
  }

  async function deleteList(id) {
    if (!id) return { ok: false, error: 'invalid_input' };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { error } = await sb
      .from('lists')
      .delete()
      .eq('id', id)
      .eq('user_id', s.user.id);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  window.PeekdLists = { fetchLists, createList, updateList, deleteList };
})();
