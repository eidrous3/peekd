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
      .order('created_at', { ascending: false });

    if (error) return { ok: false, error: error.message, lists: [] };

    return {
      ok: true,
      lists: (data || []).map(toUiList),
    };
  }

  window.PeekdLists = { fetchLists };
})();
