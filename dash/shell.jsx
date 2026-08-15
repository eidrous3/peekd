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

  function Sidebar({ page, setPage, collapsed, setCollapsed, dark, setDark, onUpgrade, pro, onManageBilling, profile }) {
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
            onClick: pro ? onManageBilling : onUpgrade,
            title: pro ? 'Pro plan — manage billing' : 'Upgrade to Premium',
          }, React.createElement(Icon, { name: 'bolt', size: 16, fill: 'currentColor', stroke: 0 }))
        : React.createElement('div', { className: 'plan-card' + (pro ? ' plan-pro' : '') },
          pro
            ? [
                React.createElement('div', { key: 't', className: 'pc-tag', style: { color: '#fff' } }, '⚡ PRO PLAN'),
                React.createElement('div', { key: 'x', className: 'pc-text', style: { color: 'rgba(255,255,255,0.85)' } }, "You're on Pro — every feature unlocked."),
                React.createElement('button', { key: 'b', className: 'btn btn-sm', style: { width: '100%', background: 'rgba(255,255,255,0.16)', color: '#fff' }, onClick: onManageBilling }, 'Manage billing'),
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
          unread > 0 && React.createElement('span', { className: 'dot-badge' }, unread > 99 ? '99+' : unread),
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

  // Live tracking alerts, bottom-right. Kept separate from the centered action
  // toast so an alert and a confirmation can be on screen at the same time.
  function AlertStack({ alerts, onDismiss, onSelect }) {
    if (!alerts?.length) return null;
    return React.createElement('div', { className: 'alert-stack' },
      alerts.map((a) => React.createElement('div', { key: a.key, className: 'alert-toast' },
        React.createElement('span', { className: 'timeline-ico ti-' + (a.type === 'reply' ? 'replied' : 'opened') },
          React.createElement(Icon, { name: a.type === 'reply' ? 'cornerUpLeft' : 'eye', size: 15 })),
        React.createElement('button', { className: 'alert-body', onClick: () => onSelect?.(a) },
          React.createElement('div', { className: 'alert-text' },
            React.createElement('b', null, a.who + ' '),
            React.createElement('span', { className: 'dim' }, a.text)),
          React.createElement('div', { className: 'alert-time' }, a.time)),
        React.createElement('button', {
          className: 'alert-x', title: 'Dismiss', onClick: () => onDismiss(a.key),
        }, React.createElement(Icon, { name: 'x', size: 13 })),
      )),
    );
  }

  // Interactive line chart — move across it to reveal the value at each point.
  // Pass `data` for a single line, or `series` ([{ label, data, color }]) to
  // overlay several lines on a shared scale with a legend.
  function Chart({ data, series, labels, height = 84, axis = false, fmt = (v) => v, accent, accentSoft }) {
    const [hi, setHi] = useState(null);
    const ref = useRef(null);
    const given = Array.isArray(series) && series.length
      ? series
      : [{ data: Array.isArray(data) && data.length ? data : [0] }];
    const n = Math.max(...given.map((s) => (Array.isArray(s.data) ? s.data.length : 0)), 1);
    const lines = given.map((s, i) => ({
      label: s.label || '',
      color: s.color || 'var(--accent)',
      fill: s.fill !== false && given.length === 1,
      // Dashed lines stay readable where two series sit on identical values.
      dash: s.dash || null,
      data: Array.from({ length: n }, (_, j) => Number(s.data?.[j]) || 0),
      key: s.key || s.label || String(i),
    }));
    const values = lines.flatMap((l) => l.data);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = (max - min) || 1;
    const multi = lines.length > 1;
    const hasLabels = Array.isArray(labels) && labels.length === n;
    const W = 1000;
    const H = height;
    const padT = axis ? 16 : 10;
    const padB = hasLabels ? 4 : 8;
    const xPx = (i) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
    const yPx = (v) => padT + (1 - (v - min) / span) * (H - padT - padB);
    const plotted = lines.map((l) => {
      const pts = l.data.map((d, i) => [xPx(i), yPx(d)]);
      const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      return { ...l, pts, path, area: path + ` L ${W} ${H} L 0 ${H} Z` };
    });
    // Hover indicator and tooltip anchor follow the first series.
    const pts = plotted[0].pts;
    const yTicks = axis ? [max, Math.round((max + min) / 2), min] : [];

    const labelStep = (() => {
      if (!hasLabels || n <= 7) return 1;
      if (n <= 14) return 2;
      if (n <= 31) return Math.ceil(n / 6);
      return Math.ceil(n / 8);
    })();
    const showLabelAt = (i) => {
      if (!hasLabels) return false;
      if (n <= 7) return true;
      return i === 0 || i === n - 1 || i % labelStep === 0;
    };

    const onMove = (e) => {
      if (!ref.current || n <= 1) { setHi(n <= 1 ? 0 : null); return; }
      const r = ref.current.getBoundingClientRect();
      const rel = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      setHi(Math.round(rel * (n - 1)));
    };

    const cstyle = { height: hasLabels ? H + 22 : H };
    if (accent) cstyle['--accent'] = accent;
    if (accentSoft) cstyle['--accent-soft'] = accentSoft;

    const tipText = (i) => {
      const value = multi
        ? plotted.map((l) => l.label + ' ' + fmt(l.data[i])).join(' · ')
        : fmt(plotted[0].data[i]);
      if (hasLabels && labels[i]) return labels[i] + ' · ' + value;
      return value;
    };

    const plot = React.createElement('div', { className: 'chart-plot', ref, onMouseMove: onMove, onMouseLeave: () => setHi(null) },
      React.createElement('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', className: 'chart-svg' },
        axis && yTicks.map((t, i) => { const y = yPx(t); return React.createElement('line', { key: i, x1: 0, x2: W, y1: y, y2: y, stroke: 'var(--line)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }); }),
        plotted.map((l) => l.fill && React.createElement('path', { key: 'a' + l.key, d: l.area, fill: 'var(--accent-soft)' })),
        plotted.map((l) => React.createElement('path', {
          key: 'l' + l.key,
          d: l.path,
          fill: 'none',
          stroke: l.color,
          strokeWidth: axis ? 2 : 1.6,
          ...(l.dash ? { strokeDasharray: l.dash } : {}),
          vectorEffect: 'non-scaling-stroke',
        })),
        hi != null && React.createElement('line', { x1: pts[hi][0], x2: pts[hi][0], y1: 0, y2: H, stroke: multi ? 'var(--fg-mute)' : 'var(--accent)', strokeWidth: 1, strokeDasharray: '3 3', vectorEffect: 'non-scaling-stroke', opacity: 0.4 }),
        axis && plotted.flatMap((l) => l.pts.map((p, i) => React.createElement('circle', { key: l.key + i, cx: p[0], cy: p[1], r: 2.5, fill: l.color }))),
      ),
      plotted.flatMap((l) => l.pts.map((p, i) => React.createElement('span', {
        key: l.key + i,
        className: 'chart-dot' + (hi === i ? ' on' : ''),
        style: { left: (p[0] / W * 100) + '%', top: (p[1] / H * 100) + '%', background: l.color },
      }))),
      hi != null && (() => {
        const leftPct = (pts[hi][0] / W * 100);
        const tipStyle = {
          left: leftPct + '%',
          top: (pts[hi][1] / H * 100) + '%',
          transform: leftPct < 12 ? 'translate(0, -150%)' : leftPct > 88 ? 'translate(-100%, -150%)' : 'translate(-50%, -150%)',
        };
        return React.createElement('span', { className: 'chart-tip', style: tipStyle }, tipText(hi));
      })(),
    );

    const legend = multi && React.createElement('div', { className: 'chart-legend' },
      plotted.map((l) => React.createElement('span', { key: l.key, className: 'chart-legend-item' },
        React.createElement('span', {
          className: 'chart-legend-swatch' + (l.dash ? ' dashed' : ''),
          style: { background: l.dash ? 'transparent' : l.color, borderColor: l.color },
        }),
        l.label)),
    );

    const xAxis = hasLabels && React.createElement('div', { className: 'chart-x' },
      labels.map((label, i) => {
        if (!showLabelAt(i)) return null;
        const transform = i === 0 ? 'translateX(0)' : i === n - 1 ? 'translateX(-100%)' : 'translateX(-50%)';
        return React.createElement('span', {
          key: i,
          className: 'chart-x-label',
          style: { left: (xPx(i) / W * 100) + '%', transform },
        }, label);
      }),
    );

    const chart = React.createElement('div', { className: 'chart' + (axis ? ' chart-axis' : ''), style: cstyle },
      axis && React.createElement('div', { className: 'chart-y' }, yTicks.map((t, i) => React.createElement('span', { key: i }, fmt(t)))),
      React.createElement('div', { className: 'chart-main' }, plot, xAxis),
    );

    if (!legend) return chart;
    return React.createElement('div', { className: 'chart-wrap' }, chart, legend);
  }

  Object.assign(window, { Avatar, Switch, Sidebar, Header, Toast, AlertStack, Chart });
})();
