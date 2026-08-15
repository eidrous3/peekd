// Peekd dashboard — root app: state, routing, overlays.
(function () {
  const { useState, useEffect, useRef } = React;
  const { Sidebar, Header, Toast, AlertStack, InboxPage, AnalyticsPage, CampaignsPage, PeoplePage, SettingsPage, HelpPage, Compose, Upgrade, NotifDrawer, MobileBottomNav, MoreSheet } = window;
  const D = window.PeekdData;

  const TITLES = { inbox: 'Inbox', analytics: 'Analytics', campaigns: 'Campaigns', people: 'People', settings: 'Settings', help: 'Help & docs' };

  function App() {
    const [authReady, setAuthReady] = useState(false);
    const [page, setPage] = useState(() => {
      const params = new URLSearchParams(window.location.search);
      const settingsTab = params.get('settings');
      if (settingsTab === 'integrations' || settingsTab === 'notifications') return 'settings';
      if (params.get('help') === '1') return 'help';
      return localStorage.getItem('peekd_page') || 'inbox';
    });
    const [collapsed, setCollapsed] = useState(false);
    const [dark, setDark] = useState(() => localStorage.getItem('peekd_dark') === '1');
    // The profile is the source of truth; localStorage only seeds the first paint
    // so premium users don't see gated UI flash before the profile loads.
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
    const [alerts, setAlerts] = useState([]);
    const notifPrefs = useRef(window.PeekdNotifications?.DEFAULTS || { desktop: true, sound: false, opens: true, reply: true });
    // Null until the first poll sets a baseline, so old activity is not replayed.
    const seenNotifIds = useRef(null);
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
        if (cancelled || !res.ok) return;
        setProfile(res.profile);
        applyPlan(res.profile.plan);
      })();
      return () => { cancelled = true; };
    }, []);

    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const settingsTab = params.get('settings');
      const hadSettings = settingsTab === 'integrations' || settingsTab === 'notifications';
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
    function applyNotifFeed(res) {
      if (!res?.ok) return;
      // Rows read in this session may not be saved server-side yet.
      const pending = res.notifications.filter(n => n.unread && readIds.current.has(n.id)).length;
      setNotifs(res.notifications.map(n => (readIds.current.has(n.id) ? { ...n, unread: false } : n)));
      setUnread(Math.max(0, (res.unreadCount || 0) - pending));
      announce(res.notifications);
    }

    async function loadNotifs() {
      if (!window.PeekdNotifications?.fetchNotifications) {
        setNotifs(D.notifications);
        setUnread(D.notifications.filter(n => n.unread).length);
        setNotifsLoading(false);
        return;
      }
      // Read what's already stored first so those rows become the baseline.
      // Then sync mailbox replies and announce anything that just appeared.
      const res = await window.PeekdNotifications.fetchNotifications();
      setNotifsLoading(false);
      applyNotifFeed(res);

      const sync = await window.PeekdNotifications.syncReplies?.();
      if (sync && !sync.skipped) {
        const again = await window.PeekdNotifications.fetchNotifications();
        applyNotifFeed(again);
      }
    }

    const dismissAlert = (key) => setAlerts(list => list.filter(a => a.key !== key));

    function showAlerts(items, { chime } = {}) {
      if (!items.length) return;
      const shown = items.slice(0, 3).map((n, i) => ({
        ...n,
        key: n.key || n.id || `alert-${Date.now()}-${i}`,
      }));
      setAlerts((current) => [...shown, ...current].slice(0, 4));
      shown.forEach((a) => setTimeout(() => dismissAlert(a.key), 8000));
      if (chime) window.PeekdAlerts?.playChime();
    }

    // Raise a bottom-right alert (and optionally a chime) for activity that
    // appeared since the last poll, honouring the Settings → Notifications toggles.
    function announce(list) {
      // Fingerprint includes the event time so a newly detected reply (same
      // recipient id, new replied_at) is treated as fresh.
      const ids = new Set(list.map(n => n.id + '|' + n.at));
      const known = seenNotifIds.current;
      seenNotifIds.current = ids;

      const prefs = notifPrefs.current;
      if (!known || !prefs) return;

      const fresh = list.filter((n) => {
        if (known.has(n.id + '|' + n.at) || readIds.current.has(n.id)) return false;
        // A reply is toasted when we first discover it, even if replied_at is
        // older than the "mark all read" watermark (sync lags the real send).
        if (n.type === 'reply') return true;
        return n.unread && prefs.opens;
      });
      if (!fresh.length) return;

      showAlerts(prefs.desktop ? fresh : [], { chime: !!prefs.sound });
    }

    useEffect(() => {
      if (!authReady) return undefined;
      let cancelled = false;

      const load = async () => {
        const res = await window.PeekdNotifications?.fetchNotificationSettings?.();
        if (!cancelled && res?.ok) notifPrefs.current = res.settings;
      };
      load();

      const onChanged = (e) => { if (e.detail) notifPrefs.current = e.detail; else load(); };
      const onPreview = (e) => {
        const prefs = notifPrefs.current || {};
        showAlerts([e.detail || { type: 'open', who: 'Peekd', text: 'will show alerts here', time: 'Just now' }], {
          chime: !!prefs.sound,
        });
      };
      window.addEventListener('peekd:notification-settings', onChanged);
      window.addEventListener('peekd:preview-alert', onPreview);
      return () => {
        cancelled = true;
        window.removeEventListener('peekd:notification-settings', onChanged);
        window.removeEventListener('peekd:preview-alert', onPreview);
      };
    }, [authReady]);

    useEffect(() => {
      if (!authReady) return undefined;
      loadNotifs();
      const timer = setInterval(loadNotifs, 15_000);
      const onVisible = () => { if (document.visibilityState === 'visible') loadNotifs(); };
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
      };
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

    function applyPlan(plan) {
      const isPro = window.PeekdProfile?.isProPlan?.(plan) || plan === 'premium' || plan === 'lifetime';
      setPro(isPro);
      localStorage.setItem('peekd_pro', isPro ? '1' : '0');
    }

    async function startCheckout() {
      const Billing = window.PeekdPaddle;
      if (!Billing?.configured()) {
        toast('Payments are not set up yet');
        return;
      }
      if (!profile?.id) {
        toast('Sign in to upgrade');
        return;
      }
      setUpgrade(false);
      const res = await Billing.openCheckout({
        userId: profile.id,
        email: profile.email,
        customerId: profile.paddleCustomerId,
        dark,
      });
      if (res.status === 'closed') return;
      if (res.status === 'error') {
        toast(res.error || 'Could not open checkout');
        return;
      }
      toast('Payment received — unlocking Pro…');
      const next = await Billing.waitForPremium(window.PeekdProfile.fetchProfile);
      if (next) {
        applyPlan('premium');
        setProfile(next);
        toast('Welcome to Pro 🎉 All features unlocked');
        return;
      }
      toast('Payment received. Refresh in a moment if Pro is not unlocked yet.');
    }

    async function manageBilling() {
      const Billing = window.PeekdPaddle;
      if (!Billing?.openPortal) {
        toast('Could not open billing');
        return;
      }
      const res = await Billing.openPortal();
      if (res.ok) return;
      if (res.error === 'no_paddle_customer') {
        toast('No Paddle billing profile yet — upgrade to create one');
        return;
      }
      if (res.error === 'paddle_not_configured') {
        toast('Billing portal is not set up yet');
        return;
      }
      toast('Could not open billing. Try again in a moment.');
    }

    async function redeemCoupon(code) {
      const session = await window.PeekdAuth?.ensureSession?.();
      const token = session?.access_token;
      if (!token) {
        toast('Sign in to redeem a coupon');
        return false;
      }
      let res;
      try {
        res = await fetch('/.netlify/functions/redeem-coupon', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });
      } catch {
        toast('Could not reach the server. Try again.');
        return false;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const err = data.error || '';
        toast(
          err === 'invalid_code' ? 'That coupon is not valid'
            : err === 'already_used' ? 'invalid coupon'
              : err === 'already_lifetime' ? 'You already have lifetime access'
                : err === 'coupons_missing' ? 'Coupons are not set up in the database yet'
                  : 'Could not redeem that coupon',
        );
        return false;
      }
      applyPlan('lifetime');
      setProfile((p) => (p ? { ...p, plan: 'lifetime' } : p));
      setUpgrade(false);
      toast('Welcome to lifetime membership.');
      return true;
    }

    const goPro = () => startCheckout();

    let body;
    if (page === 'inbox') body = React.createElement(InboxPage, { free, onUpgrade: openUpgrade, onCompose: openCompose, toast, setHeaderExtra, setHeaderCTA, inboxRefreshKey });
    else if (page === 'analytics') body = React.createElement(AnalyticsPage, { toast, setHeaderExtra, free, onUpgrade: openUpgrade });
    else if (page === 'campaigns') body = React.createElement(CampaignsPage, { free, onUpgrade: openUpgrade, toast, setHeaderExtra, setHeaderCTA, seed: campaignSeed, clearSeed: () => setCampaignSeed(null) });
    else if (page === 'people') body = React.createElement(PeoplePage, { free, onUpgrade: openUpgrade, toast, setHeaderExtra, setHeaderCTA, onUseInCampaign: (list) => { setCampaignSeed(list); setPage('campaigns'); } });
    else if (page === 'settings') body = React.createElement(SettingsPage, { onUpgrade: openUpgrade, onManageBilling: manageBilling, toast, pro, onProfileChange: setProfile });
    else body = React.createElement(HelpPage, { toast });

    const isInbox = page === 'inbox';
    if (!authReady) {
      return React.createElement('div', { className: 'app app-loading', style: { display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--fg-mute)' } }, 'Loading…');
    }
    return React.createElement('div', { className: 'app' + (collapsed ? ' collapsed' : '') },
      React.createElement(Sidebar, { page, setPage, collapsed, setCollapsed, dark, setDark, onUpgrade: openUpgrade, pro, onManageBilling: manageBilling, profile }),
      React.createElement('div', { className: 'main' },
        React.createElement(Header, { title: TITLES[page] || 'Peekd', unread, onBell: () => { setBell(true); loadNotifs(); }, extra: headerExtra, cta: headerCTA }),
        React.createElement('div', { className: 'page', style: isInbox ? { overflow: 'hidden' } : {} }, body),
      ),
      compose && React.createElement(Compose, { free, initialBody: composeBody, reply: composeReply, onClose: () => setCompose(false), onUpgrade: () => { setCompose(false); openUpgrade(); }, toast, onSent: () => setInboxRefreshKey((k) => k + 1) }),
      upgrade && React.createElement(Upgrade, { onClose: () => setUpgrade(false), onConfirm: goPro, onRedeemCoupon: redeemCoupon, toast }),
      bell && React.createElement(NotifDrawer, { onClose: () => setBell(false), notifs, loading: notifsLoading, onMarkAllRead: markAllNotifsRead, onSelect: openNotif }),
      React.createElement(MobileBottomNav, { page, setPage, moreOpen, setMoreOpen }),
      moreOpen && React.createElement(MoreSheet, { page, setPage, dark, setDark, onClose: () => setMoreOpen(false), profile }),
      React.createElement(AlertStack, {
        alerts,
        onDismiss: dismissAlert,
        onSelect: (a) => { dismissAlert(a.key); setBell(true); },
      }),
      React.createElement(Toast, { msg: toastMsg }),
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();
