// Peekd dashboard — root app: state, routing, overlays.
(function () {
  const { useState, useEffect, useRef } = React;
  const { Sidebar, Header, Toast, InboxPage, AnalyticsPage, CampaignsPage, PeoplePage, SettingsPage, HelpPage, Compose, Upgrade, NotifDrawer, MobileBottomNav, MoreSheet } = window;
  const D = window.PeekdData;

  const TITLES = { inbox: 'Inbox', analytics: 'Analytics', campaigns: 'Campaigns', people: 'People', settings: 'Settings', help: 'Help & docs' };

  function App() {
    const [authReady, setAuthReady] = useState(false);
    const [page, setPage] = useState(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('settings') === 'integrations') return 'settings';
      if (params.get('help') === '1') return 'help';
      return localStorage.getItem('peekd_page') || 'inbox';
    });
    const [collapsed, setCollapsed] = useState(false);
    const [dark, setDark] = useState(() => localStorage.getItem('peekd_dark') === '1');
    const [pro, setPro] = useState(() => localStorage.getItem('peekd_pro') === '1');
    const free = !pro; // gates active when not Pro
    const [inboxRefreshKey, setInboxRefreshKey] = useState(0);
    const [compose, setCompose] = useState(false);
    const [composeBody, setComposeBody] = useState('');
    const [composeReply, setComposeReply] = useState(null);
    const [upgrade, setUpgrade] = useState(false);
    const [bell, setBell] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [notifs, setNotifs] = useState([]);
    const [unread, setUnread] = useState(0);
    const [notifsLoading, setNotifsLoading] = useState(true);
    // Rows read by clicking them; kept here so a refresh does not un-read them.
    const readIds = useRef(new Set());
    const [toastMsg, setToastMsg] = useState('');
    const [headerExtra, setHeaderExtra] = useState(null);
    const [headerCTA, setHeaderCTA] = useState(null);
    const [campaignSeed, setCampaignSeed] = useState(null);
    const [profile, setProfile] = useState(null);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        if (!window.PeekdAuth?.ready()) {
          window.location.href = 'Peekd Login.html';
          return;
        }
        try {
          const session = await window.PeekdAuth.bootstrapDashboardAuth();
          if (!session) {
            window.location.href = 'Peekd Login.html';
            return;
          }
        } catch {
          window.location.href = 'Peekd Login.html';
          return;
        }
        if (!cancelled) setAuthReady(true);
      })();
      return () => { cancelled = true; };
    }, []);

    useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('peekd_dark', dark ? '1' : '0'); }, [dark]);
    useEffect(() => { localStorage.setItem('peekd_page', page); }, [page]);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        if (!window.PeekdProfile?.fetchProfile) return;
        const res = await window.PeekdProfile.fetchProfile();
        if (!cancelled && res.ok) setProfile(res.profile);
      })();
      return () => { cancelled = true; };
    }, []);

    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const hadSettings = params.get('settings') === 'integrations';
      const hadHelp = params.get('help') === '1';
      if (!hadSettings && !hadHelp) return;
      if (hadSettings) params.delete('settings');
      if (hadHelp) params.delete('help');
      const qs = params.toString();
      const next = window.location.pathname + (qs ? `?${qs}` : '');
      window.history.replaceState({}, '', next);
    }, []);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        if (!window.PeekdProfile?.restoreProfile) return;
        const res = await window.PeekdProfile.restoreProfile();
        if (!cancelled && res.ok && res.restored) toast('Your account is activated');
      })();
      return () => { cancelled = true; };
    }, []);

    const toast = (msg) => { setToastMsg(msg); clearTimeout(window.__toastT); window.__toastT = setTimeout(() => setToastMsg(''), 3000); };
    async function loadNotifs() {
      if (!window.PeekdNotifications?.fetchNotifications) {
        setNotifs(D.notifications);
        setUnread(D.notifications.filter(n => n.unread).length);
        setNotifsLoading(false);
        return;
      }
      const res = await window.PeekdNotifications.fetchNotifications();
      setNotifsLoading(false);
      if (!res.ok) return;
      // Rows read in this session may not be saved server-side yet.
      const pending = res.notifications.filter(n => n.unread && readIds.current.has(n.id)).length;
      setNotifs(res.notifications.map(n => (readIds.current.has(n.id) ? { ...n, unread: false } : n)));
      setUnread(Math.max(0, (res.unreadCount || 0) - pending));
    }

    useEffect(() => {
      if (!authReady) return undefined;
      loadNotifs();
      const timer = setInterval(loadNotifs, 60_000);
      return () => clearInterval(timer);
    }, [authReady]);

    async function markAllNotifsRead() {
      setNotifs(notifs.map(n => ({ ...n, unread: false })));
      setUnread(0);
      if (!window.PeekdNotifications?.markAllNotificationsRead) return;
      const res = await window.PeekdNotifications.markAllNotificationsRead();
      if (!res.ok) toast('Could not mark notifications read.');
    }

    function openNotif(n) {
      if (!n.unread) return;
      readIds.current.add(n.id);
      setNotifs(notifs.map(x => (x.id === n.id ? { ...x, unread: false } : x)));
      setUnread(c => Math.max(0, c - 1));
      window.PeekdNotifications?.markNotificationRead?.(n.id);
    }

    // Accepts either a prefilled body string or a reply descriptor from the inbox.
    const openCompose = (arg) => {
      setComposeBody(typeof arg === 'string' ? arg : '');
      setComposeReply(arg && typeof arg === 'object' ? arg : null);
      setCompose(true);
    };
    const openUpgrade = () => setUpgrade(true);
    const goPro = () => { setPro(true); localStorage.setItem('peekd_pro', '1'); setUpgrade(false); toast('Welcome to Pro 🎉 All features unlocked'); };
    const goFree = () => { setPro(false); localStorage.setItem('peekd_pro', '0'); toast('Switched to Free plan'); };

    let body;
    if (page === 'inbox') body = React.createElement(InboxPage, { free, onUpgrade: openUpgrade, onCompose: openCompose, toast, setHeaderExtra, setHeaderCTA, inboxRefreshKey });
    else if (page === 'analytics') body = React.createElement(AnalyticsPage, { toast, setHeaderExtra, free, onUpgrade: openUpgrade });
    else if (page === 'campaigns') body = React.createElement(CampaignsPage, { free, onUpgrade: openUpgrade, toast, setHeaderExtra, setHeaderCTA, seed: campaignSeed, clearSeed: () => setCampaignSeed(null) });
    else if (page === 'people') body = React.createElement(PeoplePage, { free, onUpgrade: openUpgrade, toast, setHeaderExtra, setHeaderCTA, onUseInCampaign: (list) => { setCampaignSeed(list); setPage('campaigns'); } });
    else if (page === 'settings') body = React.createElement(SettingsPage, { onUpgrade: openUpgrade, toast, pro, onProfileChange: setProfile });
    else body = React.createElement(HelpPage, { toast });

    const isInbox = page === 'inbox';
    if (!authReady) {
      return React.createElement('div', { className: 'app app-loading', style: { display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--fg-mute)' } }, 'Loading…');
    }
    return React.createElement('div', { className: 'app' + (collapsed ? ' collapsed' : '') },
      React.createElement(Sidebar, { page, setPage, collapsed, setCollapsed, dark, setDark, onUpgrade: openUpgrade, pro, onToggleFree: goFree, profile }),
      React.createElement('div', { className: 'main' },
        React.createElement(Header, { title: TITLES[page] || 'Peekd', unread, onBell: () => { setBell(true); loadNotifs(); }, extra: headerExtra, cta: headerCTA }),
        React.createElement('div', { className: 'page', style: isInbox ? { overflow: 'hidden' } : {} }, body),
      ),
      compose && React.createElement(Compose, { free, initialBody: composeBody, reply: composeReply, onClose: () => setCompose(false), onUpgrade: () => { setCompose(false); openUpgrade(); }, toast, onSent: () => setInboxRefreshKey((k) => k + 1) }),
      upgrade && React.createElement(Upgrade, { onClose: () => setUpgrade(false), onConfirm: goPro, toast }),
      bell && React.createElement(NotifDrawer, { onClose: () => setBell(false), notifs, loading: notifsLoading, onMarkAllRead: markAllNotifsRead, onSelect: openNotif }),
      React.createElement(MobileBottomNav, { page, setPage, moreOpen, setMoreOpen }),
      moreOpen && React.createElement(MoreSheet, { page, setPage, dark, setDark, onClose: () => setMoreOpen(false), profile }),
      React.createElement(Toast, { msg: toastMsg }),
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();
