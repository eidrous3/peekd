// Peekd dashboard — Settings page.
(function () {
  const { useState, useEffect, useRef } = React;
  const Icon = window.Icon;
  const { Avatar, Switch } = window;
  const D = window.PeekdData;

  // Real brand marks (inline SVG) for the integration rows.
  function BrandLogo({ name, size = 22 }) {
    const wrap = (kids) => React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' }, kids);
    if (name === 'Gmail') {
      return wrap([
        React.createElement('path', { key: 'r', d: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H6l6 4.5L18 5h1.5A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H18V9.8l-6 4.5-6-4.5V19H4.5A1.5 1.5 0 0 1 3 17.5v-11Z', fill: '#EA4335' }),
        React.createElement('path', { key: 'l', d: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H6v14H4.5A1.5 1.5 0 0 1 3 17.5v-11Z', fill: '#4285F4' }),
        React.createElement('path', { key: 'rr', d: 'M21 6.5A1.5 1.5 0 0 0 19.5 5H18v14h1.5a1.5 1.5 0 0 0 1.5-1.5v-11Z', fill: '#34A853' }),
        React.createElement('path', { key: 'm', d: 'M6 5l6 4.5L18 5v4.8l-6 4.5-6-4.5V5Z', fill: '#FBBC04' }),
        React.createElement('path', { key: 'v', d: 'M6 5l6 4.5L18 5v.001L12 9.8 6 5.3V5Z', fill: '#C5221F' }),
      ]);
    }
    if (name === 'Outlook') {
      return wrap([
        React.createElement('rect', { key: 'b', x: 10, y: 5, width: 11, height: 14, rx: 1.5, fill: '#0A66C2' }),
        React.createElement('path', { key: 'f', d: 'M10 8.5l5.5 3.2L21 8.5V10l-5.5 3.2L10 10V8.5Z', fill: '#fff', opacity: 0.9 }),
        React.createElement('rect', { key: 'o', x: 2.5, y: 6.5, width: 11, height: 11, rx: 3, fill: '#1B7FD6' }),
        React.createElement('ellipse', { key: 'e', cx: 8, cy: 12, rx: 2.6, ry: 3, fill: '#fff' }),
        React.createElement('ellipse', { key: 'e2', cx: 8, cy: 12, rx: 1, ry: 1.4, fill: '#1B7FD6' }),
      ]);
    }
    // Custom / generic mail
    return wrap([
      React.createElement('rect', { key: 'b', x: 3, y: 5.5, width: 18, height: 13, rx: 2.5, stroke: 'var(--fg-mute)', strokeWidth: 1.6 }),
      React.createElement('path', { key: 'f', d: 'M4 7l8 6 8-6', stroke: 'var(--fg-mute)', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    ]);
  }

  function ToggleRow({ title, desc, on, onToggle, disabled, tip, badge }) {
    return React.createElement('div', { className: 'toggle-row' + (disabled ? ' disabled' : ''), title: disabled ? tip : undefined },
      React.createElement('div', null,
        React.createElement('div', { className: 'tr-title' }, title, badge && React.createElement('span', { className: 'tr-badge' }, badge)),
        React.createElement('div', { className: 'tr-desc' }, desc)),
      React.createElement(Switch, { on: disabled ? false : on, onClick: disabled ? undefined : onToggle }),
    );
  }

  function SetSection({ label }) {
    return React.createElement('div', { className: 'set-section-label' }, label);
  }

  function AppleMark({ size = 19 }) {
    return React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor' },
      React.createElement('path', { d: 'M16.365 1.43c0 1.14-.42 2.205-1.124 3.005-.853.97-2.244 1.72-3.385 1.63-.135-1.116.42-2.31 1.078-3.057.74-.842 2.05-1.46 3.13-1.512.018.155.018.31.018.466zM19.062 11.85c-.024 2.572 2.245 3.426 2.27 3.437-.02.062-.354 1.215-1.17 2.405-.704 1.03-1.435 2.055-2.587 2.077-1.13.022-1.494-.67-2.785-.67-1.29 0-1.694.648-2.764.692-1.11.044-1.957-1.115-2.667-2.142-1.452-2.1-2.562-5.937-1.072-8.527.74-1.287 2.062-2.102 3.497-2.123 1.09-.02 2.12.733 2.785.733.666 0 1.918-.906 3.234-.773.55.023 2.096.222 3.088 1.674-.08.05-1.844 1.077-1.824 3.21z' }));
  }

  function AndroidMark({ size = 19 }) {
    return React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none' },
      React.createElement('path', { d: 'M8 6.2 6.7 4.2M16 6.2l1.3-2', stroke: '#3DDC84', strokeWidth: 1.3, strokeLinecap: 'round' }),
      React.createElement('path', { d: 'M6.5 11a5.5 5.5 0 0 1 11 0v4.4a1.1 1.1 0 0 1-1.1 1.1H7.6A1.1 1.1 0 0 1 6.5 15.4V11z', fill: '#3DDC84' }),
      React.createElement('circle', { cx: 9.6, cy: 10.6, r: .95, fill: '#fff' }),
      React.createElement('circle', { cx: 14.4, cy: 10.6, r: .95, fill: '#fff' }));
  }

  function StoreBtn({ icon, top, bottom, href }) {
    return React.createElement('a', { className: 'store-btn', href, target: '_blank', rel: 'noopener noreferrer' },
      React.createElement('span', { className: 'store-ico' }, icon),
      React.createElement('span', { className: 'store-text' },
        React.createElement('span', { className: 'store-top' }, top),
        React.createElement('span', { className: 'store-bottom' }, bottom)));
  }

  function DeleteAccountModal({ onClose, onConfirm, deleting }) {
    React.useEffect(() => {
      const k = (e) => e.key === 'Escape' && !deleting && onClose();
      document.addEventListener('keydown', k);
      return () => document.removeEventListener('keydown', k);
    }, [deleting, onClose]);

    return React.createElement('div', { className: 'backdrop', onMouseDown: deleting ? undefined : onClose },
      React.createElement('div', { className: 'modal', style: { width: 'min(440px, calc(100vw - 40px))' }, onMouseDown: e => e.stopPropagation() },
        React.createElement('div', { className: 'modal-head' }, React.createElement('h3', null, 'Delete account'),
          React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose, disabled: deleting }, React.createElement(Icon, { name: 'x', size: 16 }))),
        React.createElement('div', { className: 'modal-body' },
          React.createElement('p', { style: { lineHeight: 1.65, margin: 0 } }, 'Your account will be deleted and you will be signed out. You can sign up again later with the same email.')),
        React.createElement('div', { className: 'modal-foot' },
          React.createElement('button', { className: 'btn btn-ghost', onClick: onClose, disabled: deleting }, 'Cancel'),
          React.createElement('button', { className: 'btn btn-danger', onClick: onConfirm, disabled: deleting }, deleting ? 'Deleting…' : 'Delete account'),
        ),
      ),
    );
  }

  function AccountTab({ onUpgrade, toast, pro, profileStatus, profile, setProfile }) {
    const [draftName, setDraftName] = useState('');
    const [draftTimezone, setDraftTimezone] = useState('America/New_York');
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
      if (!profile) return;
      setDraftName(profile.name || '');
      setDraftTimezone(profile.timezone || 'America/New_York');
    }, [profile]);

    const dirty = !!profile && (
      draftName.trim() !== (profile.name || '').trim() ||
      draftTimezone !== profile.timezone
    );

    const displayName = profileStatus === 'ready' && profile
      ? (draftName.trim() || profile.email.split('@')[0] || 'Account')
      : '…';
    const displayEmail = profileStatus === 'ready' && profile ? profile.email : '…';
    const displayInitials = profileStatus === 'ready' && profile
      ? window.PeekdProfile.initials(draftName.trim(), profile.email)
      : '…';

    async function handleSave() {
      if (!dirty || saving || !profile) return;
      setSaving(true);
      const res = await window.PeekdProfile.updateProfile({
        name: draftName.trim(),
        timezone: draftTimezone,
      });
      setSaving(false);
      if (!res.ok) {
        toast('Could not save profile. Try again.');
        return;
      }
      setProfile(res.profile);
      toast('Profile saved ✓');
    }

    async function handleDeleteAccount() {
      if (deleting) return;
      setDeleting(true);
      const res = await window.PeekdProfile.softDeleteProfile();
      if (!res.ok) {
        setDeleting(false);
        toast('Could not delete account. Try again.');
        return;
      }
      await window.PeekdAuth.signOut();
      window.location.href = 'Peekd Login.html';
    }

    return React.createElement('div', null,
      React.createElement('h2', null, 'Account'),
      React.createElement('div', { className: 'sp-sub' }, 'Your profile and workspace'),
      profileStatus === 'no_session' && React.createElement('p', { className: 'dim', style: { marginBottom: 16 } }, 'Sign in to load your account.'),
      profileStatus === 'error' && React.createElement('p', { className: 'dim', style: { marginBottom: 16, color: 'var(--danger)' } }, 'Could not load your profile. Try refreshing.'),
      React.createElement('div', { className: 'profile-row' },
        React.createElement(Avatar, { initials: displayInitials, size: 56, fontSize: 20 }),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('div', { className: 'pr-name' }, displayName,
            pro && React.createElement('span', { className: 'pro-badge' }, React.createElement(Icon, { name: 'bolt', size: 12, fill: 'currentColor', stroke: 0 }), 'Pro')),
          React.createElement('div', { className: 'pr-email' }, displayEmail),
          React.createElement('div', { className: 'pr-plan' + (pro ? ' pr-plan-pro' : '') }, pro ? 'PRO PLAN · all features unlocked' : 'FREE PLAN · limited tracking')),
        !pro && React.createElement('button', { className: 'btn btn-upgrade', style: { width: 'auto', padding: '0 16px' }, onClick: onUpgrade }, React.createElement(Icon, { name: 'bolt', size: 14, fill: 'currentColor', stroke: 0 }), 'Upgrade to Premium')),
      React.createElement('div', { className: 'field', style: { maxWidth: 360, marginBottom: 16 } },
        React.createElement('label', { className: 'field-label' }, 'DISPLAY NAME'),
        React.createElement('input', {
          className: 'input',
          value: profileStatus === 'ready' ? draftName : '',
          onChange: (e) => setDraftName(e.target.value),
          disabled: profileStatus !== 'ready',
          placeholder: profileStatus === 'loading' ? 'Loading…' : 'Add your display name',
        })),
      React.createElement(TimeZoneSelect, { value: draftTimezone, onChange: setDraftTimezone, disabled: profileStatus !== 'ready' }),
      dirty && React.createElement('button', {
        className: 'btn btn-primary',
        style: { marginBottom: 20, paddingRight: 15, marginRight: 15 },
        onClick: handleSave,
        disabled: saving,
      }, saving ? 'Saving…' : 'Save changes'),
      React.createElement('button', {
        className: 'btn btn-ghost',
        style: { color: 'var(--danger)', borderColor: 'var(--line)' },
        onClick: () => setConfirmDelete(true),
        disabled: profileStatus !== 'ready' || deleting,
      }, 'Delete account'),
      confirmDelete && React.createElement(DeleteAccountModal, {
        onClose: () => setConfirmDelete(false),
        onConfirm: handleDeleteAccount,
        deleting,
      }),
    );
  }

  function NotificationsTab({ toast }) {
    const N = window.PeekdNotifications;
    const [notifStatus, setNotifStatus] = useState('loading');
    const [savedNotif, setSavedNotif] = useState(null);
    const [notif, setNotif] = useState(() => ({ ...N.DEFAULTS }));
    const [saving, setSaving] = useState(false);
    const [appInstalled] = useState(false);

    useEffect(() => {
      if (!N) {
        setNotifStatus('error');
        return;
      }
      let cancelled = false;
      setNotifStatus('loading');
      (async () => {
        const res = await N.fetchNotificationSettings();
        if (cancelled) return;
        if (!res.ok) {
          setSavedNotif(null);
          setNotifStatus(res.error === 'no_session' ? 'no_session' : 'error');
          return;
        }
        setSavedNotif(res.settings);
        setNotif(res.settings);
        setNotifStatus('ready');
      })();
      return () => { cancelled = true; };
    }, []);

    const dirty = savedNotif && N && !N.settingsEqual(notif, savedNotif);
    const ready = notifStatus === 'ready';

    async function handleSave() {
      if (!dirty || saving || !N) return;
      setSaving(true);
      const res = await N.updateNotificationSettings(notif);
      setSaving(false);
      if (!res.ok) {
        toast('Could not save notification settings. Try again.');
        return;
      }
      setSavedNotif(res.settings);
      setNotif(res.settings);
      toast('Notification settings saved ✓');
    }

    return React.createElement('div', null,
      React.createElement('h2', null, 'Notifications'),
      React.createElement('div', { className: 'sp-sub' }, 'Choose what Peekd alerts you about'),
      notifStatus === 'loading' && React.createElement('p', { className: 'dim', style: { marginBottom: 16 } }, 'Loading…'),
      notifStatus === 'no_session' && React.createElement('p', { className: 'dim', style: { marginBottom: 16 } }, 'Sign in to load your notification settings.'),
      notifStatus === 'error' && React.createElement('p', { className: 'dim', style: { marginBottom: 16, color: 'var(--danger)' } }, 'Could not load notification settings. Try refreshing.'),
      ready && React.createElement('div', null,
        React.createElement(SetSection, { label: 'Tracking alerts' }),
        React.createElement(ToggleRow, { title: 'Email opens', desc: 'Push alert when a recipient reads your email', on: notif.opens, onToggle: () => setNotif({ ...notif, opens: !notif.opens }) }),
        React.createElement(ToggleRow, { title: 'Link clicks', badge: 'NEW', desc: 'Push alert when a recipient clicks a link', on: notif.links, onToggle: () => setNotif({ ...notif, links: !notif.links }) }),
        React.createElement(ToggleRow, { title: 'Reply read', desc: 'When someone reads a reply you sent', on: notif.reply, onToggle: () => setNotif({ ...notif, reply: !notif.reply }) }),
        React.createElement(SetSection, { label: 'Delivery channels' }),
        React.createElement(ToggleRow, { title: 'Desktop (Browser)', desc: 'Native browser popups in the bottom-right', on: notif.desktop, onToggle: () => setNotif({ ...notif, desktop: !notif.desktop }) }),
        React.createElement(ToggleRow, { title: 'Notification sound', desc: 'Subtle chime on new alert', on: notif.sound, onToggle: () => setNotif({ ...notif, sound: !notif.sound }) }),
        React.createElement(SetSection, { label: 'Mobile app' }),
        React.createElement('p', { className: 'mobile-note' }, 'Get Peekd on your phone for instant alerts.'),
        React.createElement('div', { className: 'store-row' },
          React.createElement(StoreBtn, { icon: React.createElement(AppleMark, null), top: 'Download on the', bottom: 'App Store', href: 'https://www.apple.com/app-store/' }),
          React.createElement(StoreBtn, { icon: React.createElement(AndroidMark, null), top: 'GET IT ON', bottom: 'Google Play', href: 'https://play.google.com/store' })),
        React.createElement(ToggleRow, { title: 'Mobile push', desc: 'Push notifications to your phone', on: notif.mobile, disabled: !appInstalled, tip: 'Install the app first', onToggle: () => setNotif({ ...notif, mobile: !notif.mobile }) }),
        React.createElement(SetSection, { label: 'Digest' }),
        React.createElement(ToggleRow, { title: 'Daily digest', desc: "Morning summary of yesterday's activity", on: notif.digest, onToggle: () => setNotif({ ...notif, digest: !notif.digest }) }),
        dirty && React.createElement('button', {
          className: 'btn btn-primary',
          style: { marginTop: 4, paddingRight: 15, marginRight: 15 },
          onClick: handleSave,
          disabled: saving,
        }, saving ? 'Saving…' : 'Save changes'),
      ),
    );
  }

  function IntegrationsTab({ toast }) {
    const I = window.PeekdIntegrations;
    const [accounts, setAccounts] = useState([]);
    const [status, setStatus] = useState('loading');
    const [connect, setConnect] = useState(null);
    const [connecting, setConnecting] = useState(false);

    async function loadAccounts() {
      if (!I) {
        setStatus('error');
        return;
      }
      setStatus('loading');
      const res = await I.fetchGmailAccounts();
      if (!res.ok) {
        setAccounts([]);
        setStatus(res.error === 'no_session' ? 'no_session' : 'error');
        return;
      }
      setAccounts(res.accounts || []);
      setStatus('ready');
    }

    useEffect(() => {
      loadAccounts();
      const params = new URLSearchParams(window.location.search);
      const gmail = params.get('gmail');
      if (gmail === 'connected') toast('Gmail connected ✓');
      else if (gmail === 'error') toast('Could not connect Gmail. Try again.');
      if (params.get('settings') === 'integrations' || gmail) {
        params.delete('settings');
        params.delete('gmail');
        const qs = params.toString();
        const next = window.location.pathname + (qs ? `?${qs}` : '');
        window.history.replaceState({}, '', next);
      }
    }, []);

    async function handleConnectGmail() {
      if (!I || connecting) return;
      setConnecting(true);
      const res = await I.startGmailConnect();
      if (!res.ok) {
        setConnecting(false);
        toast(res.error === 'missing_google_config' ? 'Gmail is not configured yet.' : 'Could not start Gmail connection.');
      }
    }

    async function handleDisconnect(accountId) {
      if (!I) return;
      const res = await I.disconnectAccount(accountId);
      if (!res.ok) {
        toast('Could not disconnect account.');
        return;
      }
      await loadAccounts();
      toast('Account disconnected');
    }

    async function handleSetPrimary(accountId) {
      if (!I) return;
      const res = await I.setPrimaryAccount(accountId);
      if (!res.ok) {
        toast('Could not set primary account.');
        return;
      }
      await loadAccounts();
      toast('Primary account updated ✓');
    }

    const gmailConnected = accounts.length > 0;
    const outlookIg = D.integrations.find((ig) => ig.name === 'Outlook') || { name: 'Outlook', desc: 'Send and track from Outlook web', status: 'connect' };

    return React.createElement('div', null,
      React.createElement('h2', null, 'Integrations'),
      React.createElement('div', { className: 'sp-sub' }, 'Connect your email and tools'),
      status === 'loading' && React.createElement('p', { className: 'dim', style: { marginBottom: 16 } }, 'Loading…'),
      status === 'no_session' && React.createElement('p', { className: 'dim', style: { marginBottom: 16 } }, 'Sign in to manage integrations.'),
      status === 'error' && React.createElement('p', { className: 'dim', style: { marginBottom: 16, color: 'var(--danger)' } }, 'Could not load integrations. Try refreshing.'),
      status === 'ready' && React.createElement('div', { className: 'integ-card' },
        React.createElement('span', { className: 'integ-ico' }, React.createElement(BrandLogo, { name: 'Gmail' })),
        React.createElement('div', { className: 'integ-body' },
          React.createElement('div', { className: 'integ-name' }, 'Gmail',
            gmailConnected && React.createElement('span', { className: 'status-chip sc-connected' }, accounts.length + ' CONNECTED')),
          React.createElement('div', { className: 'integ-desc' }, 'Send and track from Gmail web'),
          gmailConnected
            ? accounts.map((a) => React.createElement('div', { key: a.id, className: 'acct-line' },
                React.createElement('button', {
                  className: 'icon-btn',
                  style: { width: 24, height: 24, flex: '0 0 auto' },
                  onClick: () => handleDisconnect(a.id),
                  title: 'Disconnect',
                }, React.createElement(Icon, { name: 'x', size: 12 })),
                React.createElement('span', { className: 'ac-dot' }),
                React.createElement('button', {
                  className: 'btn btn-ghost btn-sm',
                  style: { padding: 0, minHeight: 0, height: 'auto', border: 'none', background: 'transparent', font: 'inherit', color: 'inherit' },
                  onClick: () => !a.is_primary && handleSetPrimary(a.id),
                  title: a.is_primary ? 'Primary account' : 'Set as primary',
                }, a.email),
                a.is_primary && React.createElement('span', { className: 'pill-tag' }, 'PRIMARY')))
            : React.createElement('div', { className: 'acct-line' }, 'No accounts connected yet.')),
        React.createElement('div', { style: { flex: '0 0 auto', alignSelf: 'center' } },
          gmailConnected
            ? React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => setConnect({ name: 'Gmail' }) }, React.createElement(Icon, { name: 'plus', size: 13 }), 'Add')
            : React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => setConnect({ name: 'Gmail' }) }, 'Connect')),
      ),
      status === 'ready' && React.createElement('div', { className: 'integ-card', style: { marginTop: 12 } },
        React.createElement('span', { className: 'integ-ico' }, React.createElement(BrandLogo, { name: 'Outlook' })),
        React.createElement('div', { className: 'integ-body' },
          React.createElement('div', { className: 'integ-name' }, outlookIg.name),
          React.createElement('div', { className: 'integ-desc' }, outlookIg.desc),
          React.createElement('div', { className: 'acct-line' }, 'No accounts connected yet.')),
        React.createElement('div', { style: { flex: '0 0 auto', alignSelf: 'center' } },
          React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => toast('Outlook coming soon') }, 'Connect')),
      ),
      React.createElement('div', { className: 'divider', style: { margin: '20px 0 16px' } }),
      React.createElement('div', { className: 'field-label', style: { marginBottom: 10 } }, 'OTHER EMAIL PROVIDERS · COMING SOON'),
      React.createElement('div', { className: 'integ-card', style: { opacity: .8 } },
        React.createElement('span', { className: 'integ-ico' }, React.createElement(BrandLogo, { name: 'Custom' })),
        React.createElement('div', { className: 'integ-body' },
          React.createElement('div', { className: 'integ-name' }, 'Custom Email (IMAP/SMTP)', React.createElement('span', { className: 'status-chip sc-soon' }, 'COMING SOON')),
          React.createElement('div', { className: 'integ-desc' }, 'Connect any email — cPanel, Zoho, Fastmail, Yahoo, any SMTP'),
          React.createElement('button', { className: 'btn btn-ghost btn-sm', style: { marginTop: 10 }, onClick: () => toast("We'll let you know!") }, React.createElement(Icon, { name: 'bell', size: 13 }), "Notify me when it's ready"))),
      connect && React.createElement(ConnectModal, {
        ig: connect,
        busy: connecting,
        onClose: () => !connecting && setConnect(null),
        onDone: handleConnectGmail,
      }),
    );
  }

  function SettingsPage({ onUpgrade, toast, pro }) {
    const [tab, setTab] = useState(() => {
      const params = new URLSearchParams(window.location.search);
      return params.get('settings') === 'integrations' ? 'integrations' : 'account';
    });
    const [profileStatus, setProfileStatus] = useState('loading');
    const [profile, setProfile] = useState(null);
    const tabs = [['account', 'Account'], ['notifications', 'Notifications'], ['integrations', 'Integrations'], ['privacy', 'Privacy']];

    useEffect(() => {
      if (tab !== 'account') return;
      let cancelled = false;
      setProfileStatus('loading');
      (async () => {
        const res = await window.PeekdProfile.fetchProfile();
        if (cancelled) return;
        if (!res.ok) {
          setProfile(null);
          setProfileStatus(res.error === 'no_session' ? 'no_session' : 'error');
          return;
        }
        setProfile(res.profile);
        setProfileStatus('ready');
      })();
      return () => { cancelled = true; };
    }, [tab]);

    return React.createElement('div', { className: 'page-pad' },
      React.createElement('div', { className: 'settings' },
        React.createElement('div', { className: 'set-nav' },
          tabs.map(([id, label]) => React.createElement('button', { key: id, className: tab === id ? 'active' : '', onClick: () => setTab(id) }, label))),
        React.createElement('div', { className: 'set-panel' },
          tab === 'account' && React.createElement(AccountTab, { onUpgrade, toast, pro, profileStatus, profile, setProfile }),
          tab === 'notifications' && React.createElement(NotificationsTab, { toast }),
          tab === 'integrations' && React.createElement(IntegrationsTab, { toast }),
          tab === 'privacy' && React.createElement('div', null,
            React.createElement('h2', null, 'Privacy'),
            React.createElement('div', { className: 'sp-sub' }, 'How your data is handled'),
            React.createElement('p', { className: 'dim', style: { lineHeight: 1.7, maxWidth: 520 } }, 'Peekd only reads email metadata required to detect opens and clicks — never the body of your messages. Tracking pixels are injected at send time and events are stored for 90 days. You can export or delete your data at any time.'),
            React.createElement('div', { className: 'flex gap8', style: { marginTop: 16 } },
              React.createElement('button', { className: 'btn btn-ghost' }, 'Export my data'),
              React.createElement('button', { className: 'btn btn-ghost', style: { color: 'var(--danger)' } }, 'Delete all tracking data')),
          ),
        ),
      ),
    );
  }

  function ConnectModal({ ig, onClose, onDone, busy }) {
    React.useEffect(() => { const k = e => e.key === 'Escape' && !busy && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [busy, onClose]);
    return React.createElement('div', { className: 'backdrop', onMouseDown: busy ? undefined : onClose },
      React.createElement('div', { className: 'modal', style: { width: 'min(440px, calc(100vw - 40px))' }, onMouseDown: e => e.stopPropagation() },
        React.createElement('div', { className: 'modal-head' }, React.createElement('h3', null, 'Connect ' + ig.name),
          React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose }, React.createElement(Icon, { name: 'x', size: 16 }))),
        React.createElement('div', { className: 'modal-body', style: { textAlign: 'center' } },
          React.createElement('span', { className: 'integ-ico', style: { margin: '0 auto 16px', width: 52, height: 52 } }, React.createElement(BrandLogo, { name: ig.name, size: 28 })),
          React.createElement('p', { style: { fontWeight: 600, marginBottom: 14 } }, 'Peekd will be able to:'),
          React.createElement('div', { style: { textAlign: 'left', maxWidth: 300, margin: '0 auto' } },
            ['Detect when sent emails are opened', 'Inject tracking pixels when you send', 'Read email metadata (not body)'].map((t, i) =>
              React.createElement('div', { key: i, className: 'upgrade-feature' }, React.createElement(Icon, { name: 'check', size: 16 }), t))),
          React.createElement('div', { className: 'locked-row', style: { marginTop: 16, justifyContent: 'center' } }, React.createElement(Icon, { name: 'lock', size: 14 }), 'We never read or store your email content.'),
        ),
        React.createElement('div', { className: 'modal-foot' },
          React.createElement('button', { className: 'btn btn-ghost', onClick: onClose, disabled: busy }, 'Cancel'),
          React.createElement('button', { className: 'btn btn-primary', onClick: onDone, disabled: busy }, busy ? 'Redirecting…' : 'Connect with ' + ig.name, !busy && React.createElement(Icon, { name: 'arrowRight', size: 15 })),
        ),
      ),
    );
  }

  window.SettingsPage = SettingsPage;

  // ── Time zone select: every IANA zone, grouped by region, searchable ──
  const TZ_REGIONS = {
    America: 'Americas', Europe: 'Europe', Asia: 'Asia', Africa: 'Africa',
    Australia: 'Australia', Pacific: 'Pacific', Atlantic: 'Atlantic',
    Indian: 'Indian Ocean', Antarctica: 'Antarctica', Arctic: 'Arctic', Etc: 'UTC / Etc',
  };
  const TZ_ORDER = ['America', 'Europe', 'Asia', 'Africa', 'Australia', 'Pacific', 'Atlantic', 'Indian', 'Antarctica', 'Arctic', 'Etc'];
  const TZ_FALLBACK = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];

  function tzOffsetLabel(tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
      const p = parts.find(x => x.type === 'timeZoneName');
      return p ? p.value.replace(/^UTC/, 'GMT') : 'GMT';
    } catch (e) { return 'GMT'; }
  }
  function tzOffsetMin(label) {
    const m = String(label).match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
  }

  function TimeZoneSelect({ toast, value: valueProp, onChange, disabled, readOnly }) {
    const locked = disabled || readOnly;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [value, setValue] = useState(valueProp || 'America/New_York');
    const ref = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
      if (valueProp !== undefined) setValue(valueProp);
    }, [valueProp]);

    useEffect(() => {
      if (!open) return;
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
      document.addEventListener('mousedown', h);
      document.addEventListener('keydown', esc);
      const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 10);
      return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', esc); clearTimeout(t); };
    }, [open]);

    const { groups, meta } = React.useMemo(() => {
      let zones;
      try { zones = (Intl.supportedValuesOf && Intl.supportedValuesOf('timeZone')) || []; } catch (e) { zones = []; }
      if (!zones.length) zones = TZ_FALLBACK;
      const meta = {};
      const byRegion = {};
      zones.forEach((tz) => {
        const off = tzOffsetLabel(tz);
        meta[tz] = { off, min: tzOffsetMin(off) };
        const r = tz.indexOf('/') === -1 ? 'Etc' : tz.split('/')[0];
        (byRegion[r] = byRegion[r] || []).push(tz);
      });
      const known = TZ_ORDER.filter(r => byRegion[r]);
      const extra = Object.keys(byRegion).filter(r => !TZ_ORDER.includes(r)).sort();
      const groups = known.concat(extra).map(r => ({
        region: r,
        label: TZ_REGIONS[r] || r,
        zones: byRegion[r].sort((a, b) => meta[a].min - meta[b].min || a.localeCompare(b)),
      }));
      return { groups, meta };
    }, []);

    const qq = query.trim().toLowerCase();
    const filtered = qq
      ? groups.map(g => ({ ...g, zones: g.zones.filter(tz => tz.toLowerCase().replace(/_/g, ' ').includes(qq) || meta[tz].off.toLowerCase().includes(qq)) })).filter(g => g.zones.length)
      : groups;

    const sub = (tz) => (tz.indexOf('/') === -1 ? tz : tz.split('/').slice(1).join(' / ')).replace(/_/g, ' ');
    const curOff = (meta[value] && meta[value].off) || tzOffsetLabel(value);

    return React.createElement('div', { className: 'field tz-field', style: { maxWidth: 360, marginBottom: 28 }, ref },
      React.createElement('label', { className: 'field-label' }, 'TIME ZONE'),
      React.createElement('button', {
        className: 'select' + (open ? ' tz-open' : ''),
        style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        onClick: locked ? undefined : () => setOpen(o => !o),
        disabled: locked,
      },
        React.createElement('span', null, value.replace(/_/g, ' ') + ' (' + curOff + ')'),
        React.createElement(Icon, { name: 'chevDown', size: 14 })),
      open && React.createElement('div', { className: 'tz-menu' },
        React.createElement('div', { className: 'tz-search' },
          React.createElement(Icon, { name: 'search', size: 15 }),
          React.createElement('input', { ref: inputRef, placeholder: 'Search city or GMT offset...', value: query, onChange: e => setQuery(e.target.value) })),
        React.createElement('div', { className: 'tz-list' },
          filtered.length === 0
            ? React.createElement('div', { className: 'tz-empty' }, 'No time zones match “' + query + '”')
            : filtered.map(g => React.createElement('div', { key: g.region, className: 'tz-group' },
                React.createElement('div', { className: 'tz-group-label' }, g.label),
                g.zones.map(tz => React.createElement('button', {
                  key: tz,
                  className: 'tz-opt' + (tz === value ? ' sel' : ''),
                  onClick: () => {
                    setValue(tz);
                    onChange && onChange(tz);
                    setOpen(false);
                    setQuery('');
                    if (!onChange && !locked && toast) toast('Time zone updated ✓');
                  },
                },
                  React.createElement('span', { className: 'tz-name' }, sub(tz)),
                  React.createElement('span', { className: 'tz-off' }, meta[tz].off))),
              )),
        ),
      ),
    );
  }

  window.TimeZoneSelect = TimeZoneSelect;
})();
