// Peekd dashboard — root app: state, routing, overlays.
(function () {
  const { useState, useEffect } = React;
  const { Sidebar, Header, Toast, InboxPage, AnalyticsPage, CampaignsPage, PeoplePage, SettingsPage, HelpPage, Compose, Upgrade, NotifDrawer, MobileBottomNav, MoreSheet } = window;
  const D = window.PeekdData;

  const TITLES = { inbox: 'Inbox', analytics: 'Analytics', campaigns: 'Campaigns', people: 'People', settings: 'Settings', help: 'Help & docs' };

  function App() {
    const [page, setPage] = useState(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('settings') === 'integrations') return 'settings';
      return localStorage.getItem('peekd_page') || 'inbox';
    });
    const [collapsed, setCollapsed] = useState(false);
    const [dark, setDark] = useState(() => localStorage.getItem('peekd_dark') === '1');
    const [pro, setPro] = useState(() => localStorage.getItem('peekd_pro') === '1');
    const free = !pro; // gates active when not Pro
    const [compose, setCompose] = useState(false);
    const [composeBody, setComposeBody] = useState('');
    const [upgrade, setUpgrade] = useState(false);
    const [bell, setBell] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [notifs, setNotifs] = useState(D.notifications);
    const [toastMsg, setToastMsg] = useState('');
    const [headerExtra, setHeaderExtra] = useState(null);
    const [headerCTA, setHeaderCTA] = useState(null);
    const [campaignSeed, setCampaignSeed] = useState(null);
    const [profile, setProfile] = useState(null);

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
      if (params.get('settings') !== 'integrations') return;
      params.delete('settings');
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
    const unread = notifs.filter(n => n.unread).length;
    const openCompose = (body) => { setComposeBody(typeof body === 'string' ? body : ''); setCompose(true); };
    const openUpgrade = () => setUpgrade(true);
    const goPro = () => { setPro(true); localStorage.setItem('peekd_pro', '1'); setUpgrade(false); toast('Welcome to Pro 🎉 All features unlocked'); };
    const goFree = () => { setPro(false); localStorage.setItem('peekd_pro', '0'); toast('Switched to Free plan'); };

    let body;
    if (page === 'inbox') body = React.createElement(InboxPage, { free, onUpgrade: openUpgrade, onCompose: openCompose, toast, setHeaderExtra, setHeaderCTA });
    else if (page === 'analytics') body = React.createElement(AnalyticsPage, { toast, setHeaderExtra, free, onUpgrade: openUpgrade });
    else if (page === 'campaigns') body = React.createElement(CampaignsPage, { free, onUpgrade: openUpgrade, toast, setHeaderExtra, setHeaderCTA, seed: campaignSeed, clearSeed: () => setCampaignSeed(null) });
    else if (page === 'people') body = React.createElement(PeoplePage, { free, onUpgrade: openUpgrade, toast, setHeaderExtra, setHeaderCTA, onUseInCampaign: (list) => { setCampaignSeed(list); setPage('campaigns'); } });
    else if (page === 'settings') body = React.createElement(SettingsPage, { onUpgrade: openUpgrade, toast, pro, onProfileChange: setProfile });
    else body = React.createElement(HelpPage, { toast });

    const isInbox = page === 'inbox';
    return React.createElement('div', { className: 'app' + (collapsed ? ' collapsed' : '') },
      React.createElement(Sidebar, { page, setPage, collapsed, setCollapsed, dark, setDark, onUpgrade: openUpgrade, pro, onToggleFree: goFree, profile }),
      React.createElement('div', { className: 'main' },
        React.createElement(Header, { title: TITLES[page] || 'Peekd', unread, onBell: () => setBell(true), extra: headerExtra, cta: headerCTA }),
        React.createElement('div', { className: 'page', style: isInbox ? { overflow: 'hidden' } : {} }, body),
      ),
      compose && React.createElement(Compose, { free, initialBody: composeBody, onClose: () => setCompose(false), onUpgrade: () => { setCompose(false); openUpgrade(); }, toast }),
      upgrade && React.createElement(Upgrade, { onClose: () => setUpgrade(false), onConfirm: goPro, toast }),
      bell && React.createElement(NotifDrawer, { onClose: () => setBell(false), notifs, setNotifs, onOpenEmail: () => { setBell(false); setPage('inbox'); } }),
      React.createElement(MobileBottomNav, { page, setPage, moreOpen, setMoreOpen }),
      moreOpen && React.createElement(MoreSheet, { page, setPage, dark, setDark, onClose: () => setMoreOpen(false), profile }),
      React.createElement(Toast, { msg: toastMsg }),
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();
