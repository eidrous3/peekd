// Peekd dashboard — mobile bottom navigation + "More" bottom sheet.
// Rendered always; hidden above 768px via responsive.css.
(function () {
  const { useEffect } = React;
  const Icon = window.Icon;
  const { Avatar, Switch } = window;

  const NAV = [
    { id: 'inbox', label: 'Inbox', icon: 'inbox', badge: '8' },
    { id: 'analytics', label: 'Analytics', icon: 'chart' },
    { id: 'campaigns', label: 'Camp.', icon: 'send' },
    { id: 'people', label: 'People', icon: 'users' },
  ];

  function MobileBottomNav({ page, setPage, moreOpen, setMoreOpen }) {
    const go = (p) => { setMoreOpen(false); setPage(p); };
    const moreActive = moreOpen || page === 'settings' || page === 'help';
    return React.createElement('nav', { className: 'mobile-bottom-nav' },
      NAV.map((it) => React.createElement('button', {
        key: it.id,
        className: 'm-nav-item' + (page === it.id ? ' active' : ''),
        onClick: () => go(it.id),
      },
        React.createElement('span', { className: 'm-nav-ico' },
          React.createElement(Icon, { name: it.icon, size: 21 }),
          it.badge && React.createElement('span', { className: 'm-nav-badge' }, it.badge),
        ),
        React.createElement('span', { className: 'm-nav-label' }, it.label),
      )),
      React.createElement('button', {
        className: 'm-nav-item' + (moreActive ? ' active' : ''),
        onClick: () => setMoreOpen(!moreOpen),
      },
        React.createElement('span', { className: 'm-nav-ico' }, React.createElement(Icon, { name: 'dots', size: 21 })),
        React.createElement('span', { className: 'm-nav-label' }, 'More'),
      ),
    );
  }

  function MoreSheet({ page, setPage, dark, setDark, onClose }) {
    useEffect(() => {
      const k = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', k);
      return () => document.removeEventListener('keydown', k);
    }, []);
    const go = (p) => { onClose(); setPage(p); };
    const row = (icon, label, onClick, active) => React.createElement('button', {
      className: 'm-sheet-row' + (active ? ' active' : ''), onClick,
    },
      React.createElement('span', { className: 'm-sheet-ico' }, React.createElement(Icon, { name: icon, size: 19 })),
      React.createElement('span', { className: 'm-sheet-label' }, label),
      React.createElement(Icon, { name: 'chevRight', size: 16, className: 'm-sheet-arrow' }),
    );
    return React.createElement('div', { className: 'm-sheet-bg', onMouseDown: onClose },
      React.createElement('div', { className: 'm-sheet', onMouseDown: (e) => e.stopPropagation() },
        React.createElement('div', { className: 'm-sheet-grip' }),
        React.createElement('div', { className: 'm-sheet-head' },
          React.createElement(Avatar, { initials: 'HM', size: 40 }),
          React.createElement('div', { className: 'm-sheet-head-text' },
            React.createElement('div', { className: 'm-sheet-name' }, 'Hannah Mitchell'),
            React.createElement('div', { className: 'm-sheet-email' }, 'hannah@peekd.app'),
          ),
        ),
        React.createElement('div', { className: 'm-sheet-list' },
          row('settings', 'Settings', () => go('settings'), page === 'settings'),
          row('help', 'Help & docs', () => go('help'), page === 'help'),
          React.createElement('div', { className: 'm-sheet-toggle', onClick: () => setDark(!dark) },
            React.createElement('span', { className: 'm-sheet-ico' }, React.createElement(Icon, { name: dark ? 'sun' : 'moon', size: 19 })),
            React.createElement('span', { className: 'm-sheet-label' }, 'Dark mode'),
            React.createElement(Switch, { on: dark, onClick: () => setDark(!dark) }),
          ),
        ),
        React.createElement('button', { className: 'm-sheet-logout', onClick: () => { window.location.href = 'Peekd Login.html'; } },
          React.createElement(Icon, { name: 'logout', size: 18 }), 'Log out',
        ),
      ),
    );
  }

  Object.assign(window, { MobileBottomNav, MoreSheet });
})();
