// Peekd dashboard — shared overlays: Compose, Upgrade, Notifications drawer.
(function () {
  const { useState } = React;
  const Icon = window.Icon;
  const { Avatar } = window;
  const D = window.PeekdData;

  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

  function Compose({ free, onClose, onUpgrade, toast, initialBody }) {
    const [to, setTo] = useState(['elena@northwind.co']);
    const [draft, setDraft] = useState('');
    const [fromOpen, setFromOpen] = useState(false);
    const [from, setFrom] = useState('john@gmail.com');
    const [body, setBody] = useState(initialBody || '');
    React.useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
    const addEmail = (e) => {
      if ((e.key === 'Enter' || e.key === ',') && draft.trim()) { e.preventDefault(); setTo([...to, draft.trim()]); setDraft(''); }
    };
    const bad = draft && !validEmail(draft);

    return React.createElement('div', { className: 'backdrop', onMouseDown: onClose },
      React.createElement('div', { className: 'modal wide', onMouseDown: e => e.stopPropagation() },
        React.createElement('div', { className: 'modal-head' }, React.createElement('h3', null, 'New Email'),
          React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose }, React.createElement(Icon, { name: 'x', size: 16 }))),
        React.createElement('div', { className: 'modal-body', style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          React.createElement('div', { className: 'field', style: { position: 'relative' } }, React.createElement('label', { className: 'field-label' }, 'FROM'),
            React.createElement('button', { className: 'select', style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, onClick: () => setFromOpen(!fromOpen) },
              React.createElement('span', null, React.createElement('span', { className: 'ac-dot', style: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--good)', marginRight: 8 } }), from, React.createElement('span', { className: 'muted', style: { marginLeft: 8, fontSize: 12 } }, '(Gmail)')),
              React.createElement(Icon, { name: 'chevDown', size: 14 })),
            fromOpen && React.createElement('div', { className: 'card', style: { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 5, padding: 5, boxShadow: 'var(--shadow-md)' } },
              D.accounts.map((a, i) => React.createElement('button', { key: i, className: 'check-line', style: { width: '100%' }, onClick: () => { setFrom(a.email); setFromOpen(false); } },
                React.createElement('span', { className: 'ac-dot', style: { width: 7, height: 7, borderRadius: '50%', background: 'var(--good)' } }), a.email, React.createElement('span', { className: 'muted', style: { fontSize: 12 } }, '(' + a.kind + ')'))),
              React.createElement('div', { className: 'divider', style: { margin: '4px 0' } }),
              React.createElement('button', { className: 'check-line', style: { width: '100%', color: 'var(--accent)' } }, React.createElement(Icon, { name: 'plus', size: 14 }), 'Connect another account')),
          ),
          React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'TO'),
            React.createElement('div', { className: 'pill-input' },
              to.map((em, i) => React.createElement('span', { key: i, className: 'email-pill' + (validEmail(em) ? '' : ' bad'), title: validEmail(em) ? '' : 'Invalid email' }, em,
                React.createElement('span', { className: 'pill-x', onClick: () => setTo(to.filter((_, j) => j !== i)) }, React.createElement(Icon, { name: 'x', size: 11 })))),
              React.createElement('input', { value: draft, placeholder: to.length ? '' : 'name@company.com', onChange: e => setDraft(e.target.value), onKeyDown: addEmail })),
            bad && React.createElement('span', { style: { fontSize: 11.5, color: 'var(--danger)' } }, 'Enter a valid email address'),
          ),
          React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'SUBJECT'), React.createElement('input', { className: 'input', placeholder: 'Subject' })),
          React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'MESSAGE'),
            React.createElement(window.RichEditor, { value: initialBody || '', onChange: setBody, minHeight: 200, placeholder: 'Write your message…' })),
        ),
        React.createElement('div', { className: 'modal-foot', style: { justifyContent: 'space-between' } },
          React.createElement('button', { className: 'btn btn-ghost btn-sm' }, React.createElement(Icon, { name: 'paperclip', size: 14 }), 'Attach'),
          React.createElement('div', { className: 'flex center gap12' },
            free && React.createElement('button', { className: 'upgrade-inline', style: { marginLeft: 0 }, onClick: onUpgrade }, 'Pro: remove branding ↗'),
            React.createElement('button', { className: 'btn btn-ghost', onClick: onClose }, 'Cancel'),
            React.createElement('button', { className: 'btn btn-primary', onClick: () => { onClose(); toast('Email sent & tracking ✓'); } }, 'Send & Track', React.createElement(Icon, { name: 'arrowRight', size: 15 })),
          ),
        ),
      ),
    );
  }

  function Upgrade({ onClose, onConfirm, toast }) {
    React.useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
    const feats = ['Campaigns & sequences', 'People Lists', 'Link click tracking', 'AI follow-up suggestions', 'Remove branding', 'Advanced analytics', 'Priority support'];
    return React.createElement('div', { className: 'backdrop', onMouseDown: onClose },
      React.createElement('div', { className: 'modal', style: { width: 'min(420px, calc(100vw - 40px))' }, onMouseDown: e => e.stopPropagation() },
        React.createElement('div', { className: 'modal-head' }, React.createElement('h3', null, 'Upgrade to Pro'),
          React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose }, React.createElement(Icon, { name: 'x', size: 16 }))),
        React.createElement('div', { className: 'modal-body' },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 } },
            React.createElement('span', { className: 'gate-ico', style: { width: 42, height: 42, margin: 0, borderRadius: 11, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff' } }, React.createElement(Icon, { name: 'bolt', size: 20, stroke: 2 })),
            React.createElement('div', null, React.createElement('div', { style: { fontWeight: 700, fontSize: 17 } }, 'Peekd Pro'), React.createElement('div', { className: 'muted', style: { fontSize: 13 } }, '$7 / month'))),
          React.createElement('div', { className: 'muted', style: { fontSize: 13, margin: '12px 0 6px' } }, 'Everything in Free, plus:'),
          feats.map((f, i) => React.createElement('div', { key: i, className: 'upgrade-feature' }, React.createElement(Icon, { name: 'check', size: 16 }), f)),
        ),
        React.createElement('div', { className: 'modal-foot', style: { flexDirection: 'column', gap: 8 } },
          React.createElement('button', { className: 'btn btn-upgrade', onClick: () => (onConfirm ? onConfirm() : (onClose(), toast('Welcome to Pro! 🎉'))) }, React.createElement(Icon, { name: 'bolt', size: 15, fill: 'currentColor', stroke: 0 }), 'Upgrade now — $7/mo'),
          React.createElement('button', { className: 'btn btn-ghost btn-block', onClick: onClose }, 'Maybe later'),
          React.createElement('div', { className: 'muted', style: { fontSize: 11.5, textAlign: 'center' } }, 'No contracts · cancel anytime'),
        ),
      ),
    );
  }

  function NotifDrawer({ onClose, notifs, setNotifs, onOpenEmail }) {
    const [tab, setTab] = useState('all');
    React.useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
    let list = notifs;
    if (tab === 'unread') list = notifs.filter(n => n.unread);
    else if (tab === 'opens') list = notifs.filter(n => n.type === 'open');
    else if (tab === 'replies') list = notifs.filter(n => n.type === 'reply');
    const initials = (name) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    return React.createElement('div', { className: 'drawer-wrap' },
      React.createElement('div', { className: 'drawer-bg', onClick: onClose }),
      React.createElement('div', { className: 'drawer' },
        React.createElement('div', { className: 'modal-head' },
          React.createElement('h3', null, 'Notifications'),
          React.createElement('div', { className: 'flex center gap12' },
            React.createElement('button', { className: 'banner-link', style: { marginLeft: 0 }, onClick: () => setNotifs(notifs.map(n => ({ ...n, unread: false }))) }, 'Mark all read'),
            React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose }, React.createElement(Icon, { name: 'x', size: 16 }))),
        ),
        React.createElement('div', { style: { padding: '12px 16px', borderBottom: '1px solid var(--line)' } },
          React.createElement('div', { className: 'tabs' },
            [['all', 'All'], ['unread', 'Unread'], ['opens', 'Opens'], ['replies', 'Replies']].map(([id, l]) =>
              React.createElement('button', { key: id, className: 'tab' + (tab === id ? ' active' : ''), onClick: () => setTab(id) }, l))),
        ),
        React.createElement('div', { style: { flex: 1, overflowY: 'auto' } },
          list.length === 0
            ? React.createElement('div', { style: { textAlign: 'center', color: 'var(--fg-mute)', padding: 40, fontSize: 13 } }, 'Nothing here yet')
            : list.map(n => React.createElement('button', {
                key: n.id, className: 'notif-row-d',
                onClick: () => { setNotifs(notifs.map(x => x.id === n.id ? { ...x, unread: false } : x)); onOpenEmail(); },
              },
                React.createElement('span', { className: 'timeline-ico ti-' + (n.type === 'reply' ? 'replied' : 'opened') }, React.createElement(Icon, { name: n.type === 'reply' ? 'cornerUpLeft' : 'eye', size: 15 })),
                React.createElement('div', { style: { flex: 1, minWidth: 0, textAlign: 'left' } },
                  React.createElement('div', { style: { fontSize: 13 } }, React.createElement('b', null, n.who + ' '), React.createElement('span', { className: 'dim' }, n.text)),
                  React.createElement('div', { className: 'muted', style: { fontSize: 11.5, marginTop: 2 } }, n.time)),
                n.unread && React.createElement('span', { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flex: '0 0 auto', alignSelf: 'center' } }),
              )),
        ),
      ),
    );
  }

  Object.assign(window, { Compose, Upgrade, NotifDrawer });
})();
