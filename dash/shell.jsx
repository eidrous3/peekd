// Peekd dashboard — app shell: sidebar, header, shared primitives.
(function () {
  const { useState, useRef, useEffect } = React;
  const Icon = window.Icon;
  const C = window.PeekdData.avatarColors;

  function Avatar({ initials, size = 28, fontSize }) {
    return React.createElement('span', {
      className: 'avatar-sm',
      style: { width: size, height: size, fontSize: fontSize || size * 0.4, background: C[initials] || '#64748b' },
    }, initials);
  }

  function Switch({ on, onClick, locked }) {
    return React.createElement('span', {
      className: 'switch' + (on ? ' on' : '') + (locked ? ' locked' : ''),
      onClick: locked ? undefined : onClick,
    });
  }

  const NAV = [
    { group: 'WORKSPACE', items: [
      { id: 'inbox', label: 'Inbox', icon: 'inbox', badge: '8' },
      { id: 'analytics', label: 'Analytics', icon: 'chart' },
      { id: 'campaigns', label: 'Campaigns', icon: 'send', badge: '3' },
      { id: 'people', label: 'People', icon: 'users' },
    ]},
    { group: 'ACCOUNT', items: [
      { id: 'settings', label: 'Settings', icon: 'settings' },
      { id: 'help', label: 'Help & docs', icon: 'help' },
    ]},
  ];

  function Sidebar({ page, setPage, collapsed, setCollapsed, dark, setDark, onUpgrade, pro, onToggleFree, profile }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [logoutConfirm, setLogoutConfirm] = useState(false);
    const footRef = useRef(null);
    useEffect(() => {
      if (!menuOpen) return;
      const h = (e) => { if (footRef.current && !footRef.current.contains(e.target)) setMenuOpen(false); };
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, [menuOpen]);
    const go = (p) => { setPage(p); setMenuOpen(false); };
    const user = window.PeekdProfile?.displayProfile(profile) || { name: '…', email: '…', initials: '…' };
    const handleLogout = async () => {
      setMenuOpen(false);
      setLogoutConfirm(false);
      if (window.PeekdAuth?.signOut) await window.PeekdAuth.signOut();
      window.location.href = 'Peekd Login.html';
    };
    return React.createElement('aside', { className: 'side' },
      React.createElement('div', { className: 'side-top' },
        React.createElement('div', { className: 'brand' },
          React.createElement('span', { className: 'logo' }, React.createElement(Icon, { name: 'eye', size: 17, stroke: 2 })),
          React.createElement('span', null, 'Peekd'),
        ),
      ),
      React.createElement('div', { className: 'side-scroll' },
        NAV.map((g) => React.createElement('div', { key: g.group },
          React.createElement('div', { className: 'nav-group-label' }, g.group),
          g.items.map((it) => React.createElement('button', {
            key: it.id,
            className: 'nav-item' + (page === it.id ? ' active' : ''),
            onClick: () => setPage(it.id),
            title: it.label,
          },
            React.createElement('span', { className: 'ni-ico' }, React.createElement(Icon, { name: it.icon, size: 18 })),
            React.createElement('span', { className: 'ni-label' }, it.label),
            it.badge && React.createElement('span', { className: 'nav-badge' }, it.badge),
          )),
        )),
        React.createElement('button', { className: 'nav-item nav-theme', onClick: () => setDark(!dark), title: 'Dark mode' },
          React.createElement('span', { className: 'ni-ico' }, React.createElement(Icon, { name: dark ? 'sun' : 'moon', size: 18 })),
          React.createElement('span', { className: 'ni-label' }, dark ? 'Light mode' : 'Dark mode'),
          React.createElement(Switch, { on: dark, onClick: () => setDark(!dark) }),
        ),
      ),
      collapsed
        ? React.createElement('button', {
            className: 'plan-mini' + (pro ? ' pro' : ''),
            onClick: pro ? onToggleFree : onUpgrade,
            title: pro ? 'Pro plan — switch to Free (demo)' : 'Upgrade to Premium',
          }, React.createElement(Icon, { name: 'bolt', size: 16, fill: 'currentColor', stroke: 0 }))
        : React.createElement('div', { className: 'plan-card' + (pro ? ' plan-pro' : '') },
          pro
            ? [
                React.createElement('div', { key: 't', className: 'pc-tag', style: { color: '#fff' } }, '⚡ PRO PLAN'),
                React.createElement('div', { key: 'x', className: 'pc-text', style: { color: 'rgba(255,255,255,0.85)' } }, "You're on Pro — every feature unlocked."),
                React.createElement('button', { key: 'b', className: 'btn btn-sm', style: { width: '100%', background: 'rgba(255,255,255,0.16)', color: '#fff' }, onClick: onToggleFree }, 'Switch to Free (demo)'),
              ]
            : [
                React.createElement('div', { key: 't', className: 'pc-tag' }, 'FREE PLAN'),
                React.createElement('div', { key: 'x', className: 'pc-text' }, 'Unlock unlimited tracking, campaigns & team lists.'),
                React.createElement('button', { key: 'b', className: 'btn btn-upgrade btn-sm', onClick: onUpgrade },
                  React.createElement(Icon, { name: 'bolt', size: 14, fill: 'currentColor', stroke: 0 }), 'Upgrade to Premium'),
              ],
        ),
      React.createElement('div', { className: 'side-foot', ref: footRef },
        React.createElement('button', { className: 'collapse-btn', onClick: () => setCollapsed(!collapsed) },
          React.createElement(Icon, { name: 'panelLeft', size: 16 }),
          React.createElement('span', null, 'Collapse'),
        ),
        React.createElement('div', { className: 'avatar-menu-wrap' },
          React.createElement('button', { className: 'avatar-btn', onClick: () => setMenuOpen(!menuOpen), title: 'Account' }, React.createElement(Avatar, { initials: user.initials })),
          menuOpen && React.createElement('div', { className: 'avatar-menu' },
            React.createElement('div', { className: 'am-head' },
              React.createElement('div', { className: 'am-name' }, user.name),
              React.createElement('div', { className: 'am-email' }, user.email),
            ),
            React.createElement('div', { className: 'am-sep' }),
            React.createElement('button', { className: 'am-item', onClick: () => go('settings') }, React.createElement(Icon, { name: 'settings', size: 16 }), 'Settings'),
            React.createElement('button', { className: 'am-item', onClick: () => go('help') }, React.createElement(Icon, { name: 'help', size: 16 }), 'Help & docs'),
            React.createElement('div', { className: 'am-sep' }),
            React.createElement('button', { className: 'am-item am-danger', onClick: () => { setMenuOpen(false); setLogoutConfirm(true); } }, React.createElement(Icon, { name: 'logout', size: 16 }), 'Log out'),
          ),
        ),
      ),
      logoutConfirm && React.createElement('div', { className: 'backdrop', onMouseDown: () => setLogoutConfirm(false) },
        React.createElement('div', { className: 'modal', style: { width: 'min(380px, calc(100vw - 40px))' }, onMouseDown: (e) => e.stopPropagation() },
          React.createElement('div', { className: 'modal-body', style: { textAlign: 'center', paddingTop: 28 } },
            React.createElement('h3', { style: { margin: '0 0 8px', fontSize: 17 } }, 'Log out of Peekd?'),
            React.createElement('p', { className: 'muted', style: { fontSize: 13.5, margin: 0 } }, "You'll need to sign in again to access your inbox."),
          ),
          React.createElement('div', { className: 'modal-foot', style: { justifyContent: 'center' } },
            React.createElement('button', { className: 'btn btn-ghost', onClick: () => setLogoutConfirm(false) }, 'Cancel'),
            React.createElement('button', { className: 'btn', style: { background: 'var(--danger)', color: '#fff' }, onClick: handleLogout }, 'Log out'),
          ),
        ),
      ),
    );
  }

  function Header({ title, unread, onBell, extra, cta }) {
    return React.createElement('header', { className: 'header' },
      React.createElement('h1', null, title),
      React.createElement('div', { className: 'header-actions' },
        extra,
        React.createElement('button', { className: 'icon-btn', onClick: onBell, title: 'Notifications' },
          React.createElement(Icon, { name: 'bell', size: 18 }),
          unread > 0 && React.createElement('span', { className: 'dot-badge' }, unread),
        ),
        cta,
      ),
    );
  }

  function Toast({ msg }) {
    if (!msg) return null;
    return React.createElement('div', { className: 'toast-wrap' },
      React.createElement('div', { className: 'toast' },
        React.createElement(Icon, { name: 'checkCircle', size: 16 }), msg));
  }

  // Interactive line chart — move across it to reveal the value at each point.
  function Chart({ data, height = 84, axis = false, fmt = (v) => v, accent, accentSoft }) {
    const [hi, setHi] = useState(null);
    const ref = useRef(null);
    const n = data.length, max = Math.max(...data), min = Math.min(...data);
    const span = (max - min) || 1;
    const W = 1000, H = height, padT = axis ? 16 : 10, padB = 8;
    const xPx = (i) => (i / (n - 1)) * W;
    const yPx = (v) => padT + (1 - (v - min) / span) * (H - padT - padB);
    const pts = data.map((d, i) => [xPx(i), yPx(d)]);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = path + ` L ${W} ${H} L 0 ${H} Z`;
    const yTicks = axis ? [max, Math.round((max + min) / 2), min] : [];

    const onMove = (e) => {
      const r = ref.current.getBoundingClientRect();
      const rel = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      setHi(Math.round(rel * (n - 1)));
    };

    const cstyle = { height: H };
    if (accent) cstyle['--accent'] = accent;
    if (accentSoft) cstyle['--accent-soft'] = accentSoft;
    return React.createElement('div', { className: 'chart' + (axis ? ' chart-axis' : ''), style: cstyle },
      axis && React.createElement('div', { className: 'chart-y' }, yTicks.map((t, i) => React.createElement('span', { key: i }, fmt(t)))),
      React.createElement('div', { className: 'chart-plot', ref, onMouseMove: onMove, onMouseLeave: () => setHi(null) },
        React.createElement('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', className: 'chart-svg' },
          axis && yTicks.map((t, i) => { const y = yPx(t); return React.createElement('line', { key: i, x1: 0, x2: W, y1: y, y2: y, stroke: 'var(--line)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }); }),
          React.createElement('path', { d: area, fill: 'var(--accent-soft)' }),
          React.createElement('path', { d: path, fill: 'none', stroke: 'var(--accent)', strokeWidth: axis ? 2 : 1.6, vectorEffect: 'non-scaling-stroke' }),
          hi != null && React.createElement('line', { x1: pts[hi][0], x2: pts[hi][0], y1: 0, y2: H, stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '3 3', vectorEffect: 'non-scaling-stroke', opacity: 0.4 }),
          axis && pts.map((p, i) => React.createElement('circle', { key: i, cx: p[0], cy: p[1], r: 2.5, fill: 'var(--accent)' })),
        ),
        pts.map((p, i) => React.createElement('span', { key: i, className: 'chart-dot' + (hi === i ? ' on' : ''), style: { left: (p[0] / W * 100) + '%', top: (p[1] / H * 100) + '%' } })),
        hi != null && (() => {
          const leftPct = (pts[hi][0] / W * 100);
          const tipStyle = {
            left: leftPct + '%',
            top: (pts[hi][1] / H * 100) + '%',
            transform: leftPct < 12 ? 'translate(0, -150%)' : leftPct > 88 ? 'translate(-100%, -150%)' : 'translate(-50%, -150%)',
          };
          return React.createElement('span', { className: 'chart-tip', style: tipStyle }, fmt(data[hi]));
        })(),
      ),
    );
  }

  Object.assign(window, { Avatar, Switch, Sidebar, Header, Toast, Chart });
})();
