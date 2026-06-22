// Peekd dashboard — People page (table + Lists tab + add modals).
(function () {
  const { useState, useEffect, useRef } = React;
  const Icon = window.Icon;
  const { Avatar } = window;
  const D = window.PeekdData;

  const statusClass = { ACTIVE: 'b-active', REPLIED: 'b-replied', UNRESPONSIVE: 'b-unresp' };

  // Per-row actions: inline edit/delete on desktop (hover), a kebab menu on mobile.
  function PersonActions({ onEdit, onDelete }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const btnRef = useRef(null);
    const menuRef = useRef(null);
    const openMenu = () => { const r = btnRef.current.getBoundingClientRect(); setPos({ top: r.bottom + 6, left: r.right - 168 }); setOpen(true); };
    useEffect(() => {
      if (!open) return;
      const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false); };
      const close = () => setOpen(false);
      document.addEventListener('mousedown', h);
      window.addEventListener('scroll', close, true);
      window.addEventListener('resize', close);
      return () => { document.removeEventListener('mousedown', h); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
    }, [open]);
    return React.createElement('div', { className: 'row-actions' },
      React.createElement('button', { className: 'row-act row-act-hover', onClick: onEdit, title: 'Edit' }, React.createElement(Icon, { name: 'edit', size: 14 })),
      React.createElement('button', { className: 'row-act row-act-hover', onClick: onDelete, title: 'Delete' }, React.createElement(Icon, { name: 'trash', size: 14 })),
      React.createElement('button', { className: 'row-act row-kebab', ref: btnRef, onClick: () => open ? setOpen(false) : openMenu(), title: 'Actions' }, React.createElement(Icon, { name: 'dots', size: 16 })),
      open && React.createElement('div', { className: 'more-menu', ref: menuRef, style: { position: 'fixed', top: pos.top, left: pos.left, right: 'auto' } },
        React.createElement('button', { onClick: () => { setOpen(false); onEdit(); } }, React.createElement(Icon, { name: 'edit', size: 14 }), 'Edit'),
        React.createElement('button', { className: 'danger', onClick: () => { setOpen(false); onDelete(); } }, React.createElement(Icon, { name: 'trash', size: 14 }), 'Delete'),
      ),
    );
  }

  function PeoplePage({ free, onUpgrade, toast, setHeaderExtra, setHeaderCTA, onUseInCampaign }) {
    const [tab, setTab] = useState('people');
    const [people, setPeople] = useState(D.people);
    const [lists, setLists] = useState([]);
    const [listsStatus, setListsStatus] = useState('idle');
    const [adding, setAdding] = useState(false);
    const [creatingList, setCreatingList] = useState(false);
    const [editingPerson, setEditingPerson] = useState(null);
    const [editingList, setEditingList] = useState(null);
    const [query, setQuery] = useState('');

    async function loadLists() {
      if (!window.PeekdLists?.fetchLists) {
        setLists(D.lists);
        setListsStatus('ready');
        return;
      }
      setListsStatus('loading');
      const res = await window.PeekdLists.fetchLists();
      if (!res.ok) {
        setLists([]);
        setListsStatus(res.error === 'no_session' ? 'no_session' : 'error');
        return;
      }
      setLists(res.lists || []);
      setListsStatus('ready');
    }

    async function handleCreateList(name) {
      if (!window.PeekdLists?.createList) {
        setCreatingList(false);
        toast('List created ✓');
        return;
      }
      const res = await window.PeekdLists.createList(name);
      if (!res.ok) {
        const msg = res.error === 'duplicate_name' ? 'A list with that name already exists.'
          : res.error === 'name_required' ? 'Enter a list name.'
          : 'Could not create list.';
        toast(msg);
        return;
      }
      setCreatingList(false);
      await loadLists();
      toast('List created ✓');
    }

    async function handleUpdateList(id, name) {
      if (!window.PeekdLists?.updateList) {
        setLists(lists.map(x => x.id === id ? { ...x, name } : x));
        setEditingList(null);
        toast('List updated ✓');
        return;
      }
      const res = await window.PeekdLists.updateList(id, name);
      if (!res.ok) {
        const msg = res.error === 'duplicate_name' ? 'A list with that name already exists.' : 'Could not update list.';
        toast(msg);
        return;
      }
      setEditingList(null);
      await loadLists();
      toast('List updated ✓');
    }

    async function handleDeleteList(id) {
      if (!window.PeekdLists?.deleteList) {
        setLists(lists.filter(x => x.id !== id));
        toast('List deleted ✓');
        return;
      }
      const res = await window.PeekdLists.deleteList(id);
      if (!res.ok) {
        toast('Could not delete list.');
        return;
      }
      await loadLists();
      toast('List deleted ✓');
    }

    async function handleDuplicateList(l) {
      const copyName = `${l.name} (copy)`;
      if (!window.PeekdLists?.createList) {
        setLists(ls => [{ ...l, id: 'l' + Date.now(), name: copyName, created: 'Today' }, ...ls]);
        toast('List duplicated ✓');
        return;
      }
      const res = await window.PeekdLists.createList(copyName);
      if (!res.ok) {
        toast(res.error === 'duplicate_name' ? 'A copy of this list already exists.' : 'Could not duplicate list.');
        return;
      }
      await loadLists();
      toast('List duplicated ✓');
    }

    React.useEffect(() => {
      if (free || tab !== 'lists') return;
      loadLists();
    }, [free, tab]);

    React.useEffect(() => {
      setHeaderExtra(null);
      setHeaderCTA(React.createElement('button', { className: 'btn btn-primary', onClick: () => tab === 'lists' ? setCreatingList(true) : setAdding(true) },
        React.createElement(Icon, { name: 'plus', size: 16 }), tab === 'lists' ? 'Create list' : 'Add person'));
      return () => { setHeaderExtra(null); setHeaderCTA(null); };
    }, [tab]);

    const q = query.trim().toLowerCase();
    const shown = q ? people.filter(p => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) : people;
    const shownLists = q ? lists.filter(l => l.name.toLowerCase().includes(q)) : lists;

    return React.createElement('div', { className: 'page-pad' },
      React.createElement('div', { className: 'people-toolbar' },
        React.createElement('div', { className: 'tabs people-tabs', style: { width: 'fit-content' } },
          React.createElement('button', { className: 'tab' + (tab === 'people' ? ' active' : ''), onClick: () => setTab('people') }, 'All People'),
          React.createElement('button', { className: 'tab' + (tab === 'lists' ? ' active' : ''), onClick: () => setTab('lists') }, 'Lists'),
        ),
        React.createElement('div', { className: 'people-toolbar-right' },
          React.createElement('div', { className: 'search-input people-search' },
            React.createElement(Icon, { name: 'search', size: 16 }),
            React.createElement('input', { placeholder: tab === 'lists' ? 'Search lists...' : 'Search people...', value: query, onChange: e => setQuery(e.target.value) })),
          React.createElement('button', { className: 'btn btn-ghost', onClick: () => setCreatingList(true) }, React.createElement(Icon, { name: 'upload', size: 15 }), 'Import'),
        ),
      ),
      tab === 'people'
        ? React.createElement('div', { className: 'card', style: { overflow: 'hidden' } },
            React.createElement('table', { className: 'ptable' },
              React.createElement('thead', null, React.createElement('tr', null,
                ['NAME', 'SENT', 'OPEN RATE', 'LAST CONTACT', 'STATUS', ''].map((h, i) => React.createElement('th', { key: i }, h)))),
              React.createElement('tbody', null,
                shown.map((p, i) => React.createElement('tr', { key: p.email },
                  React.createElement('td', { className: 'pcell-primary' }, React.createElement('div', { className: 'pcell-name' },
                    React.createElement(Avatar, { initials: p.initials, size: 34 }),
                    React.createElement('div', null, React.createElement('div', { className: 'pn-main' }, p.name), React.createElement('div', { className: 'pn-email' }, p.email)))),
                  React.createElement('td', { 'data-label': 'Sent' }, p.sent),
                  React.createElement('td', { className: 'pcell-meta', 'data-label': 'Open rate' }, React.createElement('span', { className: 'rate-dot' }, React.createElement('span', { className: 'rd ' + p.dot }), p.rate + '%')),
                  React.createElement('td', { className: 'muted', 'data-label': 'Last contact' }, p.last),
                  React.createElement('td', { className: 'pcell-meta', 'data-label': 'Status' }, React.createElement('span', { className: 'badge ' + statusClass[p.status] }, p.status)),
                  React.createElement('td', { className: 'pcell-actions' }, React.createElement(PersonActions, {
                    onEdit: () => setEditingPerson(p),
                    onDelete: () => { setPeople(people.filter(x => x.email !== p.email)); toast('Contact removed'); },
                  })),
                )),
              ),
            ),
          )
        : (free
            ? React.createElement('div', { className: 'gate', style: { margin: '32px auto' } },
                React.createElement('div', { className: 'gate-ico' }, React.createElement(Icon, { name: 'lock', size: 28 })),
                React.createElement('h2', null, 'Lists · Pro Feature'),
                React.createElement('p', null, 'Group contacts into saved lists and launch campaigns to the whole list at once.'),
                React.createElement('button', { className: 'btn btn-upgrade', style: { width: 'auto', padding: '0 22px' }, onClick: onUpgrade }, React.createElement(Icon, { name: 'bolt', size: 15, fill: 'currentColor', stroke: 0 }), 'Upgrade to Pro — $7/mo'))
            : React.createElement('div', { className: 'card', style: { overflow: 'hidden' } },
                listsStatus === 'loading' && React.createElement('p', { className: 'dim', style: { padding: '20px 18px' } }, 'Loading lists…'),
                listsStatus === 'error' && React.createElement('p', { className: 'dim', style: { padding: '20px 18px', color: 'var(--danger)' } }, 'Could not load lists. Try refreshing.'),
                listsStatus === 'no_session' && React.createElement('p', { className: 'dim', style: { padding: '20px 18px' } }, 'Sign in to view your lists.'),
                listsStatus === 'ready' && React.createElement('table', { className: 'ptable' },
                  React.createElement('thead', null, React.createElement('tr', null,
                    ['LIST', 'PEOPLE', 'SENT', 'OPEN RATE', 'LAST CONTACT', ''].map((h, i) => React.createElement('th', { key: i }, h)))),
                  React.createElement('tbody', null,
                    shownLists.length === 0
                      ? React.createElement('tr', null,
                        React.createElement('td', { colSpan: 6, className: 'muted', style: { padding: '24px 18px', textAlign: 'center' } }, 'No lists yet. Create one to get started.'))
                      : shownLists.map((l) => React.createElement(ListRow, {
                        key: l.id, l, toast,
                        onEdit: () => setEditingList(l),
                        onDuplicate: () => handleDuplicateList(l),
                        onUseInCampaign: () => onUseInCampaign && onUseInCampaign(l),
                        onDelete: () => handleDeleteList(l.id),
                      })),
                  ),
                ),
              )),

      adding && React.createElement(AddPerson, { onClose: () => setAdding(false), onAdd: (p) => { setPeople([{ ...p, sent: 0, rate: 0, dot: 'r', last: 'Never', status: 'ACTIVE' }, ...people]); setAdding(false); toast('Person added ✓'); } }),
      creatingList && React.createElement(CreateList, { onClose: () => setCreatingList(false), onCreate: handleCreateList }),
      editingPerson && React.createElement(EditPerson, { p: editingPerson, lists, onClose: () => setEditingPerson(null), onSave: (upd) => { setPeople(people.map(x => x.email === editingPerson.email ? { ...x, ...upd } : x)); setEditingPerson(null); toast('Changes saved ✓'); } }),
      editingList && React.createElement(EditList, { l: editingList, onClose: () => setEditingList(null), onSave: (name) => handleUpdateList(editingList.id, name) }),
    );
  }

  function ModalShell({ title, onClose, children, foot, wide }) {
    React.useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
    return React.createElement('div', { className: 'backdrop', onMouseDown: onClose },
      React.createElement('div', { className: 'modal' + (wide ? ' wide' : ''), onMouseDown: e => e.stopPropagation() },
        React.createElement('div', { className: 'modal-head' }, React.createElement('h3', null, title),
          React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose }, React.createElement(Icon, { name: 'x', size: 16 }))),
        React.createElement('div', { className: 'modal-body' }, children),
        foot && React.createElement('div', { className: 'modal-foot' }, foot),
      ),
    );
  }

  function AddPerson({ onClose, onAdd }) {
    const [first, setFirst] = useState(''); const [last, setLast] = useState(''); const [email, setEmail] = useState('');
    return React.createElement(ModalShell, {
      title: 'Add Person', onClose,
      foot: [
        React.createElement('button', { key: 'c', className: 'btn btn-ghost', onClick: onClose }, 'Cancel'),
        React.createElement('button', { key: 'a', className: 'btn btn-primary', onClick: () => onAdd({ name: (first + ' ' + last).trim() || 'New Contact', email: email || 'unknown@email.com', initials: ((first[0] || 'N') + (last[0] || 'C')).toUpperCase() }) }, 'Add Person'),
      ],
    },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'NAME'),
          React.createElement('div', { className: 'flex gap8' },
            React.createElement('input', { className: 'input', placeholder: 'First name', value: first, onChange: e => setFirst(e.target.value) }),
            React.createElement('input', { className: 'input', placeholder: 'Last name', value: last, onChange: e => setLast(e.target.value) }))),
        React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'EMAIL'),
          React.createElement('input', { className: 'input', placeholder: 'name@company.com', value: email, onChange: e => setEmail(e.target.value) })),
        React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'COMPANY (optional)'),
          React.createElement('input', { className: 'input', placeholder: 'Acme Corp' })),
        React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'ADD TO LIST'),
          React.createElement('button', { className: 'select', style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, 'No list', React.createElement(Icon, { name: 'chevDown', size: 14 }))),
      ),
    );
  }

  function CreateList({ onClose, onCreate }) {
    const [tab, setTab] = useState('select');
    const [sel, setSel] = useState({});
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);

    async function submit() {
      if (saving) return;
      setSaving(true);
      await onCreate(name);
      setSaving(false);
    }

    return React.createElement(ModalShell, {
      title: 'New List', onClose,
      foot: [
        React.createElement('button', { key: 'c', className: 'btn btn-ghost', onClick: onClose, disabled: saving }, 'Cancel'),
        React.createElement('button', { key: 'a', className: 'btn btn-primary', onClick: submit, disabled: saving || !name.trim() }, saving ? 'Creating…' : 'Create List'),
      ],
    },
      React.createElement('div', { className: 'field', style: { marginBottom: 16 } }, React.createElement('label', { className: 'field-label' }, 'LIST NAME'),
        React.createElement('input', { className: 'input', placeholder: 'Enterprise Leads', value: name, onChange: e => setName(e.target.value), disabled: saving })),
      React.createElement('div', { className: 'field-label', style: { marginBottom: 8 } }, 'ADD PEOPLE'),
      React.createElement('div', { className: 'tabs', style: { width: 'fit-content', marginBottom: 12 } },
        React.createElement('button', { className: 'tab' + (tab === 'select' ? ' active' : ''), onClick: () => setTab('select') }, 'Search & select'),
        React.createElement('button', { className: 'tab' + (tab === 'upload' ? ' active' : ''), onClick: () => setTab('upload') }, 'Bulk upload')),
      tab === 'select'
        ? React.createElement('div', null, D.people.map((p, i) => React.createElement('label', { key: i, className: 'check-line', onClick: () => setSel({ ...sel, [i]: !sel[i] }) },
            React.createElement('span', { className: 'checkbox' + (sel[i] ? ' on' : '') }, sel[i] && React.createElement(Icon, { name: 'check', size: 12 })),
            React.createElement(Avatar, { initials: p.initials, size: 26 }),
            React.createElement('div', { style: { flex: 1 } }, React.createElement('div', { style: { fontSize: 13, fontWeight: 500 } }, p.name), React.createElement('div', { className: 'pn-email' }, p.email)))))
        : React.createElement('div', { className: 'dropzone' },
            React.createElement(Icon, { name: 'upload', size: 24, style: { margin: '0 auto 8px' } }),
            React.createElement('div', null, 'Drag & drop a .csv or .xlsx file'),
            React.createElement('div', { style: { fontSize: 12, marginTop: 4 } }, 'or click to browse')),
    );
  }

  function ListRow({ l, toast, onEdit, onDuplicate, onUseInCampaign, onDelete }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
    const [confirming, setConfirming] = useState(false);
    const menuRef = useRef(null);
    const btnRef = useRef(null);
    const openMenu = () => {
      const r = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 6, left: r.right - 190 });
      setMenuOpen(true);
    };
    useEffect(() => {
      if (!menuOpen) return;
      const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
      const close = () => setMenuOpen(false);
      document.addEventListener('mousedown', h);
      window.addEventListener('scroll', close, true);
      window.addEventListener('resize', close);
      return () => { document.removeEventListener('mousedown', h); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
    }, [menuOpen]);

    if (confirming) return React.createElement('tr', { className: 'list-confirm-row' },
      React.createElement('td', { colSpan: 6 },
        React.createElement('div', { className: 'list-confirm' },
          React.createElement('span', null, 'Delete ', React.createElement('b', null, '“' + l.name + '”'), '? This cannot be undone.'),
          React.createElement('div', { className: 'flex gap8' },
            React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => setConfirming(false) }, 'Cancel'),
            React.createElement('button', { className: 'btn btn-sm', style: { background: 'var(--danger)', color: '#fff' }, onClick: () => { setConfirming(false); onDelete(); } }, 'Delete')),
        )),
    );

    return React.createElement('tr', null,
      React.createElement('td', { className: 'pcell-primary' }, React.createElement('div', { className: 'pcell-name' },
        React.createElement('span', { className: 'list-ico', style: { width: 34, height: 34 } }, React.createElement(Icon, { name: 'users', size: 17 })),
        React.createElement('div', null, React.createElement('div', { className: 'pn-main' }, l.name), React.createElement('div', { className: 'pn-email' }, 'created ' + l.created)))),
      React.createElement('td', { className: 'muted', 'data-label': 'People' }, l.count),
      React.createElement('td', { 'data-label': 'Sent' }, l.sent),
      React.createElement('td', { className: 'pcell-meta', 'data-label': 'Open rate' }, React.createElement('span', { className: 'rate-dot' }, React.createElement('span', { className: 'rd ' + l.dot }), l.rate + '%')),
      React.createElement('td', { className: 'muted', 'data-label': 'Last contact' }, l.last),
      React.createElement('td', { className: 'pcell-actions' }, React.createElement('div', { className: 'row-actions', ref: menuRef, style: { position: 'relative' } },
        React.createElement('button', { className: 'row-act row-act-hover', onClick: onEdit }, React.createElement(Icon, { name: 'edit', size: 14 })),
        React.createElement('button', { className: 'row-act row-kebab', ref: btnRef, onClick: () => menuOpen ? setMenuOpen(false) : openMenu() }, React.createElement(Icon, { name: 'dots', size: 16 })),
        menuOpen && React.createElement('div', { className: 'more-menu list-row-dropdown', style: { position: 'fixed', top: menuPos.top, left: menuPos.left, right: 'auto' } },
          React.createElement('button', { onClick: () => { setMenuOpen(false); onEdit(); } }, React.createElement(Icon, { name: 'edit', size: 14 }), 'Edit list'),
          React.createElement('button', { onClick: () => { setMenuOpen(false); onDuplicate(); } }, React.createElement(Icon, { name: 'grid', size: 14 }), 'Duplicate list'),
          React.createElement('button', { onClick: () => { setMenuOpen(false); onUseInCampaign(); } }, React.createElement(Icon, { name: 'send', size: 14 }), 'Use in campaign'),
          React.createElement('div', { className: 'divider', style: { margin: '4px 0' } }),
          React.createElement('button', { className: 'danger', onClick: () => { setMenuOpen(false); setConfirming(true); } }, React.createElement(Icon, { name: 'trash', size: 14 }), 'Delete list'),
        ),
      )),
    );
  }

  function EditPerson({ p, lists, onClose, onSave }) {
    const parts = (p.name || '').split(' ');
    const [first, setFirst] = useState(parts[0] || '');
    const [last, setLast] = useState(parts.slice(1).join(' '));
    const [email, setEmail] = useState(p.email || '');
    const [company, setCompany] = useState(p.company || '');
    return React.createElement(ModalShell, {
      title: 'Edit Person', onClose,
      foot: [
        React.createElement('button', { key: 'c', className: 'btn btn-ghost', onClick: onClose }, 'Cancel'),
        React.createElement('button', { key: 's', className: 'btn btn-primary', onClick: () => onSave({ name: (first + ' ' + last).trim() || p.name, email: email || p.email, company, initials: ((first[0] || p.initials[0]) + (last[0] || (p.initials[1] || ''))).toUpperCase() }) }, 'Save changes'),
      ],
    },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'NAME'),
          React.createElement('div', { className: 'flex gap8' },
            React.createElement('input', { className: 'input', placeholder: 'First name', value: first, onChange: e => setFirst(e.target.value) }),
            React.createElement('input', { className: 'input', placeholder: 'Last name', value: last, onChange: e => setLast(e.target.value) }))),
        React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'EMAIL'),
          React.createElement('input', { className: 'input', value: email, onChange: e => setEmail(e.target.value) })),
        React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'COMPANY'),
          React.createElement('input', { className: 'input', placeholder: 'Acme Corp', value: company, onChange: e => setCompany(e.target.value) })),
        React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'ADD TO LIST'),
          React.createElement('button', { className: 'select', style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, (lists && lists[0] && lists[0].name) || 'No list', React.createElement(Icon, { name: 'chevDown', size: 14 }))),
      ),
    );
  }

  function EditList({ l, onClose, onSave }) {
    const [name, setName] = useState(l.name);
    const [members, setMembers] = useState(D.people.slice(0, Math.min(l.count, D.people.length)));
    return React.createElement(ModalShell, {
      title: 'Edit List', onClose, wide: true,
      foot: [
        React.createElement('button', { key: 'c', className: 'btn btn-ghost', onClick: onClose }, 'Cancel'),
        React.createElement('button', { key: 's', className: 'btn btn-primary', onClick: () => onSave(name.trim() || l.name) }, 'Save changes'),
      ],
    },
      React.createElement('div', { className: 'field', style: { marginBottom: 16 } }, React.createElement('label', { className: 'field-label' }, 'LIST NAME'),
        React.createElement('input', { className: 'input', value: name, onChange: e => setName(e.target.value) })),
      React.createElement('div', { className: 'field-label', style: { marginBottom: 8 } }, 'PEOPLE IN THIS LIST'),
      React.createElement('div', { className: 'search-input', style: { marginBottom: 12 } }, React.createElement(Icon, { name: 'search', size: 15 }), React.createElement('input', { placeholder: 'Search to add people...' })),
      members.length === 0
        ? React.createElement('div', { className: 'muted', style: { fontSize: 13, padding: '8px 2px' } }, 'No members yet.')
        : members.map((m) => React.createElement('div', { key: m.email, className: 'member-row' },
            React.createElement(Avatar, { initials: m.initials, size: 28 }),
            React.createElement('div', { style: { flex: 1, minWidth: 0 } }, React.createElement('div', { style: { fontSize: 13, fontWeight: 500 } }, m.name), React.createElement('div', { className: 'pn-email' }, m.email)),
            React.createElement('button', { className: 'row-act', onClick: () => setMembers(members.filter(x => x.email !== m.email)) }, React.createElement(Icon, { name: 'x', size: 14 })))),
    );
  }

  Object.assign(window, { PeoplePage, ModalShell });
})();
