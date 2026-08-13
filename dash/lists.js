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

  // True when the database has not run the list_members migration yet.
  function missingListMembers(error) {
    const code = error?.code;
    if (code === 'PGRST200' || code === 'PGRST205' || code === '42P01') return true;
    return /list_members/.test(error?.message || '') && /(does not exist|not find)/i.test(error?.message || '');
  }

  function warnMissingListMembers() {
    console.warn('[Peekd] The list_members table is missing. Run supabase/migrations/20260813120000_create_list_members.sql — list membership will read as empty until then.');
  }

  function membershipError(error) {
    if (missingListMembers(error)) {
      warnMissingListMembers();
      return 'migration_missing';
    }
    return error.message;
  }

  function memberCount(row) {
    const agg = row.list_members;
    if (Array.isArray(agg)) return agg[0]?.count || 0;
    return agg?.count || 0;
  }

  function toUiList(row) {
    return {
      id: row.id,
      name: row.name,
      created: formatCreated(row.created_at),
      count: memberCount(row),
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

    const query = (columns) => sb
      .from('lists')
      .select(columns)
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false });

    let { data, error } = await query(`${PUBLIC_COLUMNS}, list_members(count)`);
    if (error && missingListMembers(error)) {
      warnMissingListMembers();
      ({ data, error } = await query(PUBLIC_COLUMNS));
    }

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

  function uniqueIds(ids) {
    return [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
  }

  async function fetchListMembers(listId) {
    if (!listId) return { ok: false, error: 'invalid_input', personIds: [] };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session', personIds: [] };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured', personIds: [] };

    const { data, error } = await sb
      .from('list_members')
      .select('person_id')
      .eq('list_id', listId)
      .eq('user_id', s.user.id);

    if (error) return { ok: false, error: membershipError(error), personIds: [] };
    return { ok: true, personIds: (data || []).map((r) => r.person_id) };
  }

  async function addPeopleToList(listId, personIds) {
    const ids = uniqueIds(personIds);
    if (!listId) return { ok: false, error: 'invalid_input' };
    if (!ids.length) return { ok: true, added: 0 };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { error } = await sb
      .from('list_members')
      .upsert(
        ids.map((personId) => ({ list_id: listId, person_id: personId, user_id: s.user.id })),
        { onConflict: 'list_id,person_id', ignoreDuplicates: true },
      );

    if (error) return { ok: false, error: membershipError(error) };
    return { ok: true, added: ids.length };
  }

  async function removePeopleFromList(listId, personIds) {
    const ids = uniqueIds(personIds);
    if (!listId) return { ok: false, error: 'invalid_input' };
    if (!ids.length) return { ok: true, removed: 0 };

    const s = await session();
    if (!s?.user) return { ok: false, error: 'no_session' };

    const sb = window.PeekdAuth.client();
    if (!sb) return { ok: false, error: 'not_configured' };

    const { error } = await sb
      .from('list_members')
      .delete()
      .eq('list_id', listId)
      .eq('user_id', s.user.id)
      .in('person_id', ids);

    if (error) return { ok: false, error: membershipError(error) };
    return { ok: true, removed: ids.length };
  }

  // Replaces a list's membership with exactly `personIds`, writing only the diff.
  async function setListMembers(listId, personIds) {
    const next = uniqueIds(personIds);
    const current = await fetchListMembers(listId);
    if (!current.ok) return { ok: false, error: current.error };

    const currentSet = new Set(current.personIds);
    const nextSet = new Set(next);
    const toAdd = next.filter((id) => !currentSet.has(id));
    const toRemove = current.personIds.filter((id) => !nextSet.has(id));

    if (toAdd.length) {
      const res = await addPeopleToList(listId, toAdd);
      if (!res.ok) return res;
    }
    if (toRemove.length) {
      const res = await removePeopleFromList(listId, toRemove);
      if (!res.ok) return res;
    }
    return { ok: true, added: toAdd.length, removed: toRemove.length };
  }

  window.PeekdLists = {
    fetchLists,
    createList,
    updateList,
    deleteList,
    fetchListMembers,
    addPeopleToList,
    removePeopleFromList,
    setListMembers,
  };
})();
