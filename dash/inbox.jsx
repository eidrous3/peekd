// Peekd dashboard — Inbox page (list + detail + AI suggestion + timeline).
(function () {
  const { useState, useEffect, useRef } = React;
  const Icon = window.Icon;
  const { Avatar } = window;
  const D = window.PeekdData;

  // Track the mobile breakpoint so the inbox can switch to a single-column,
  // full-screen-detail flow without touching the desktop split view.
  function useIsMobile() {
    const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
    useEffect(() => {
      const mq = window.matchMedia('(max-width: 767px)');
      const h = () => setM(mq.matches);
      mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h);
      return () => { mq.removeEventListener ? mq.removeEventListener('change', h) : mq.removeListener(h); };
    }, []);
    return m;
  }

  const badgeClass = { OPENED: 'b-opened', REPLIED: 'b-replied', SENT: 'b-sent' };

  function EmailRow({ e, active, onClick, wide }) {
    if (wide) {
      return React.createElement('button', { className: 'mailrow mailrow-wide' + (active ? ' active' : ''), onClick },
        React.createElement('div', { className: 'mailrow-av' },
          React.createElement(Avatar, { initials: e.initials, size: 38 }),
          e.unread && React.createElement('span', { className: 'unread-dot' }),
        ),
        React.createElement('div', { className: 'mw-subject' + (e.unread ? ' strong' : '') }, e.subject),
        React.createElement('div', { className: 'mw-badges' },
          e.hot && React.createElement('span', { className: 'badge b-hot' }, '🔥 HOT'),
          React.createElement('span', { className: 'badge ' + badgeClass[e.badge] }, e.badge),
        ),
        React.createElement('div', { className: 'mw-meta' },
          React.createElement('span', { className: 'mw-name' }, e.name),
          React.createElement('span', { className: 'mw-dot' }, '·'),
          e.opens > 0 && React.createElement('span', null, e.opens + ' opens'),
          e.opens > 0 && React.createElement('span', { className: 'mw-dot' }, '·'),
          React.createElement('span', null, e.time),
        ),
      );
    }
    return React.createElement('button', { className: 'mailrow' + (active ? ' active' : ''), onClick },
      React.createElement('div', { className: 'mailrow-av' },
        React.createElement(Avatar, { initials: e.initials, size: 34 }),
        e.unread && React.createElement('span', { className: 'unread-dot' }),
      ),
      React.createElement('div', { className: 'mailrow-body' },
        React.createElement('div', { className: 'mailrow-top' },
          React.createElement('span', { className: 'mailrow-subj' + (e.unread ? ' strong' : '') }, e.subject),
          React.createElement('span', { className: 'mailrow-time' }, e.time),
        ),
        React.createElement('div', { className: 'mailrow-sub' },
          React.createElement('span', { className: 'mailrow-name' }, e.name),
          React.createElement('span', { className: 'mailrow-meta' },
            e.opens > 0 && React.createElement('span', { className: 'opens-chip' },
              React.createElement(Icon, { name: 'eye', size: 12 }), e.opens),
            e.hot && React.createElement('span', { className: 'badge b-hot' }, '🔥 HOT'),
            React.createElement('span', { className: 'badge ' + badgeClass[e.badge] }, e.badge),
          ),
        ),
      ),
    );
  }

  function TimelineEvent({ ev, free }) {
    if (ev.type === 'link' && free) return null;
    const iconMap = { sent: 'send', delivered: 'check', opened: 'eye', replied: 'cornerUpLeft', link: 'link', scheduled: 'clock', bounced: 'alertCircle' };
    return React.createElement('div', { className: 'tl-event' },
      React.createElement('span', { className: 'timeline-ico ti-' + ev.type },
        React.createElement(Icon, { name: iconMap[ev.type], size: 15 })),
      React.createElement('div', { className: 'tl-body' },
        React.createElement('div', { className: 'tl-line' },
          ev.av && React.createElement(Avatar, { initials: ev.av, size: 20, fontSize: 9 }),
          React.createElement('span', { className: 'tl-text' },
            ev.who ? React.createElement('b', null, ev.who + ' ') : null, ev.label),
          React.createElement('span', { className: 'tl-time' }, ev.time || ''),
        ),
        ev.meta && React.createElement('div', { className: 'tl-meta' }, ev.meta),
      ),
    );
  }

  function Detail({ e, free, onUpgrade, onCompose, toast, layout, onToggleLayout, mobileDetail, onMobileBack }) {
    const [showRcpts, setShowRcpts] = useState(false);
    const [aiOpen, setAiOpen] = useState(true);
    const [notify, setNotify] = useState(false);
    const [engRcpt, setEngRcpt] = useState('all');
    const [engOpen, setEngOpen] = useState(false);
    const engRef = useRef(null);
    useEffect(() => { setEngRcpt('all'); setEngOpen(false); }, [e && e.id]);
    useEffect(() => {
      if (!engOpen) return;
      const h = (ev) => { if (engRef.current && !engRef.current.contains(ev.target)) setEngOpen(false); };
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, [engOpen]);
    if (!e) return React.createElement('div', { className: 'detail empty' },
      React.createElement(Icon, { name: 'mail', size: 40 }),
      React.createElement('p', null, 'Select an email to see engagement'));

    // Recipient list + per-recipient sample engagement
    const recipients = [{ key: 'all', label: 'All recipients' }, { key: e.toEmail, label: e.to, sub: e.toEmail }]
      .concat(e.cc.map((c) => ({ key: c, label: c.split('@')[0], sub: c })));
    const hashStr = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
    const engFor = (key) => {
      if (key === 'all' || key === e.toEmail) return { opens: e.opens, last: e.lastOpened, device: e.device, location: e.location };
      const h = hashStr(key);
      const devices = ['iPhone', 'MacBook', 'Android', 'Windows', 'iPad'];
      const locations = ['New York, NY', 'London, UK', 'Berlin, DE', 'Toronto, CA', 'Remote'];
      const lasts = ['5m ago', '1h ago', '3h ago', 'Yesterday', '2 days ago'];
      return { opens: 1 + (h % 4), last: lasts[h % lasts.length], device: devices[h % devices.length], location: locations[(h >>> 3) % locations.length] };
    };
    const eng = engFor(engRcpt);
    const engLabel = (recipients.find((r) => r.key === engRcpt) || recipients[0]).label;

    return React.createElement('div', { className: 'detail' + (mobileDetail ? ' mobile-open' : '') },
      React.createElement('div', { className: 'detail-actions' },
        React.createElement('button', { className: 'btn btn-ghost btn-sm mobile-back', onClick: onMobileBack },
          React.createElement(Icon, { name: 'chevLeft', size: 16 }), 'Back'),
        React.createElement('button', { className: 'btn btn-ghost btn-sm' + (notify ? ' on' : ''), onClick: () => { setNotify(!notify); toast(notify ? 'Notifications off' : 'You\'ll be notified on next open'); } },
          React.createElement(Icon, { name: 'bell', size: 15 }), notify ? 'Notifying' : 'Notify on next open'),
        React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: onCompose },
          React.createElement(Icon, { name: 'reply', size: 15 }), 'Reply'),
        React.createElement('button', {
          className: 'icon-btn' + (layout === 'full' ? ' has-filter' : ''), style: { width: 30, height: 30 },
          title: layout === 'full' ? 'Switch to split view' : 'Switch to full view',
          onClick: onToggleLayout,
        }, React.createElement(Icon, { name: layout === 'full' ? 'inbox' : 'grid', size: 15 })),
      ),
      React.createElement('div', { className: 'detail-scroll' },
        React.createElement('div', { className: 'detail-head' },
          React.createElement('div', { className: 'flex between center', style: { gap: 12 } },
            React.createElement('h2', null, e.subject),
            React.createElement('span', { className: 'badge ' + badgeClass[e.badge], style: { flex: '0 0 auto' } }, e.badge + ' · ' + e.sentAt.split(',')[0]),
          ),
          React.createElement('div', { className: 'detail-to' },
            'To: ', React.createElement('b', null, e.to), ' ', React.createElement('span', { className: 'muted' }, e.toEmail),
            React.createElement('button', { className: 'show-rcpts', onClick: () => setShowRcpts(!showRcpts) },
              showRcpts ? 'Hide recipients' : 'Show recipients', React.createElement(Icon, { name: 'chevDown', size: 13 })),
          ),
          showRcpts && React.createElement('div', { className: 'rcpts' },
            React.createElement('div', null, React.createElement('span', { className: 'rc-tag' }, 'TO'), e.toEmail),
            e.cc.length > 0 && React.createElement('div', null, React.createElement('span', { className: 'rc-tag' }, 'CC'), e.cc.join(', ')),
            React.createElement('div', null, React.createElement('span', { className: 'rc-tag' }, 'BCC'), e.bcc.length ? e.bcc.join(', ') : '—'),
          ),
        ),

        e.preview && React.createElement('section', { className: 'd-section' },
          React.createElement('div', { className: 'd-section-title' }, 'MESSAGE'),
          React.createElement('p', { className: 'mail-preview', style: { lineHeight: 1.65, fontSize: 14, margin: 0, whiteSpace: 'pre-wrap' } }, e.preview),
        ),

        e.ai && aiOpen && React.createElement('div', { className: 'ai-card' },
          React.createElement('div', { className: 'ai-top' },
            React.createElement('span', { className: 'ai-label' }, React.createElement(Icon, { name: 'sparkles', size: 14 }), 'AI SUGGESTION'),
            React.createElement('button', { className: 'ai-x', onClick: () => setAiOpen(false) }, React.createElement(Icon, { name: 'x', size: 14 })),
          ),
          React.createElement('p', { className: 'ai-prompt' }, React.createElement('b', null, e.ai.name), ' opened your email ', React.createElement('b', null, e.ai.count + ' times'), " but hasn't replied."),
          React.createElement('div', { className: 'ai-text' }, e.ai.text),
          React.createElement('div', { className: 'ai-actions' },
            React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: () => onCompose('<p>' + e.ai.text.split(/\n\n+/).join('</p><p>').replace(/\n/g, '<br>') + '</p>') }, React.createElement(Icon, { name: 'edit', size: 14 }), 'Edit & Send'),
            React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => toast('Regenerating…') }, React.createElement(Icon, { name: 'refresh', size: 14 }), 'Regenerate'),
            React.createElement('button', { className: 'btn btn-soft btn-sm', onClick: () => setAiOpen(false) }, 'Dismiss'),
          ),
        ),

        React.createElement('section', { className: 'd-section' },
          React.createElement('div', { className: 'd-section-head' },
            React.createElement('span', { className: 'd-section-title' }, 'ENGAGEMENT'),
            React.createElement('div', { className: 'eng-filter', ref: engRef },
              React.createElement('button', { className: 'mini-select', onClick: () => setEngOpen(!engOpen) }, engLabel, React.createElement(Icon, { name: 'chevDown', size: 13 })),
              engOpen && React.createElement('div', { className: 'eng-menu' },
                recipients.map((r) => React.createElement('button', {
                  key: r.key, className: 'eng-opt' + (engRcpt === r.key ? ' on' : ''),
                  onClick: () => { setEngRcpt(r.key); setEngOpen(false); },
                },
                  React.createElement('span', { className: 'eng-check' }, engRcpt === r.key && React.createElement(Icon, { name: 'check', size: 13 })),
                  React.createElement('span', { className: 'eng-opt-body' },
                    React.createElement('span', { className: 'eng-opt-label' }, r.label),
                    r.sub && React.createElement('span', { className: 'eng-opt-sub' }, r.sub)),
                ))),
            ),
          ),
          React.createElement('div', { className: 'engage-grid' },
            [['OPENS', eng.opens, 'Tracked'], ['LAST OPENED', eng.last, 'most recent'], ['DEVICE', eng.device, engRcpt === 'all' ? 'most common' : 'this recipient'], ['LOCATION', eng.location, engRcpt === 'all' ? 'most common' : 'this recipient']]
              .map(([l, v, s]) => React.createElement('div', { key: l, className: 'engage-cell' },
                React.createElement('div', { className: 'ec-label' }, l),
                React.createElement('div', { className: 'ec-value' }, v),
                React.createElement('div', { className: 'ec-sub' }, s),
              )),
          ),
        ),

        React.createElement('section', { className: 'd-section' },
          React.createElement('div', { className: 'd-section-title' }, 'OPEN ACTIVITY'),
          React.createElement(window.Chart, { data: D.openSeries, height: 92, fmt: v => v + ' opens' }),
        ),

        React.createElement('section', { className: 'd-section' },
          React.createElement('div', { className: 'd-section-title' }, 'LINK ACTIVITY', !free ? '' : React.createElement('span', { className: 'pro-tag' }, 'PRO')),
          free
            ? React.createElement('div', { className: 'locked-row' },
                React.createElement(Icon, { name: 'lock', size: 15 }),
                React.createElement('span', null, 'Link clicks hidden · Pro feature'),
                React.createElement('button', { className: 'upgrade-inline', onClick: onUpgrade }, 'Upgrade →'))
            : (e.links.length ? e.links.map((lk, i) => React.createElement('div', { key: i, className: 'link-row' },
                React.createElement(Icon, { name: 'link', size: 14 }),
                React.createElement('div', { className: 'lk-body' },
                  React.createElement('div', { className: 'lk-top' },
                    React.createElement('span', { className: 'mono lk-url' }, lk.url),
                    React.createElement('span', { className: 'lk-clicks' }, lk.clicks + ' clicks'),
                    React.createElement('span', { className: 'lk-last' }, 'Last: ' + lk.last)),
                  React.createElement('div', { className: 'lk-bar' }, React.createElement('span', { style: { width: lk.w + '%' } })),
                  React.createElement('div', { className: 'lk-by' }, lk.by),
                ))) : React.createElement('div', { className: 'muted', style: { fontSize: 13 } }, 'No link activity yet.')),
        ),

        React.createElement('section', { className: 'd-section' },
          React.createElement('div', { className: 'd-section-title' }, 'ACTIVITY TIMELINE'),
          React.createElement('div', { className: 'timeline' },
            e.timeline.map((ev, i) => React.createElement(TimelineEvent, { key: i, ev, free })),
            free && e.links.length > 0 && React.createElement('div', { className: 'locked-row tl' },
              React.createElement(Icon, { name: 'lock', size: 15 }),
              React.createElement('span', null, 'Link clicks hidden · Pro feature'),
              React.createElement('button', { className: 'upgrade-inline', onClick: onUpgrade }, 'Upgrade →')),
          ),
        ),
      ),
    );
  }

  function AccountFilter({ acct, onSelect, accounts }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, [open]);
    const label = acct === 'all' ? 'All accounts' : acct;
    const list = accounts && accounts.length ? accounts : [];
    return React.createElement('div', { className: 'acct-filter', ref },
      React.createElement('button', { className: 'btn btn-ghost btn-sm acct-trigger', onClick: () => setOpen(!open) },
        React.createElement('span', { className: 'acct-trigger-label' }, label),
        React.createElement(Icon, { name: 'chevDown', size: 14 })),
      open && React.createElement('div', { className: 'acct-menu' },
        React.createElement('button', { className: 'acct-row', onClick: () => { onSelect('all'); setOpen(false); } },
          React.createElement('span', { className: 'acct-check' }, acct === 'all' && React.createElement(Icon, { name: 'check', size: 13 })),
          React.createElement('span', { className: 'acct-email' }, 'All accounts')),
        list.length > 0 && React.createElement('div', { className: 'divider', style: { margin: '4px 0' } }),
        list.map((a) => React.createElement('button', { key: a.email, className: 'acct-row', onClick: () => { onSelect(a.email); setOpen(false); } },
          React.createElement('span', { className: 'acct-check' }, acct === a.email && React.createElement(Icon, { name: 'check', size: 13 })),
          React.createElement('span', { className: 'acct-email' }, a.email),
          React.createElement('span', { className: 'acct-kind' }, 'Gmail'))),
      ),
    );
  }

  function InboxPage({ free, onUpgrade, onCompose, toast, setHeaderExtra, setHeaderCTA }) {
    const [emails, setEmails] = useState([]);
    const [gmailAccounts, setGmailAccounts] = useState([]);
    const [inboxStatus, setInboxStatus] = useState('loading');
    const [sel, setSel] = useState(null);
    const [tab, setTab] = useState('all');
    const [banner, setBanner] = useState(true);
    const [acct, setAcct] = useState('all');
    const [layout, setLayout] = useState('split');
    const isMobile = useIsMobile();
    const [mobileDetail, setMobileDetail] = useState(false);
    const effLayout = isMobile ? 'split' : layout;
    const [modalOpen, setModalOpen] = useState(false);
    const toggleLayout = () => { setLayout(l => l === 'split' ? 'full' : 'split'); setModalOpen(false); };
    const [query, setQuery] = useState('');
    const [filterOpen, setFilterOpen] = useState(false);
    const [appStatus, setAppStatus] = useState([]);
    const [appTime, setAppTime] = useState('any');
    const [drStatus, setDrStatus] = useState([]);
    const [drTime, setDrTime] = useState('any');
    const searchRef = useRef(null);
    const filterRef = useRef(null);

    async function loadInbox(accountEmail) {
      if (!window.PeekdGmail?.fetchInbox) {
        setInboxStatus('error');
        return;
      }
      setInboxStatus('loading');
      const res = await window.PeekdGmail.fetchInbox({
        accountEmail: accountEmail && accountEmail !== 'all' ? accountEmail : undefined,
        labelIds: 'INBOX',
        maxResults: 30,
      });
      if (!res.ok) {
        setEmails([]);
        setGmailAccounts(res.accounts || []);
        setInboxStatus(res.error === 'no_gmail_account' ? 'no_account' : 'error');
        if (res.error !== 'no_gmail_account') toast('Could not load Gmail. Try again.');
        return;
      }
      setEmails(res.messages || []);
      setGmailAccounts(res.accounts || []);
      setInboxStatus('ready');
      if (res.messages?.length) setSel(res.messages[0].id);
      else setSel(null);
      if (window.PeekdPeople?.ensurePeopleFromInboxMessages) {
        const accountEmails = (res.accounts || []).map((a) => a.email);
        window.PeekdPeople.ensurePeopleFromInboxMessages(res.messages, { excludeEmails: accountEmails }).catch(() => {});
      }
    }

    useEffect(() => { loadInbox(acct); }, []);

    useEffect(() => {
      setHeaderExtra(React.createElement(AccountFilter, { acct, onSelect: (v) => { setAcct(v); loadInbox(v); }, accounts: gmailAccounts }));
      return () => setHeaderExtra(null);
    }, [acct, gmailAccounts]);

    useEffect(() => {
      setHeaderCTA(React.createElement('button', { className: 'btn btn-primary', onClick: onCompose },
        React.createElement(Icon, { name: 'plus', size: 16 }), 'Compose'));
      return () => setHeaderCTA(null);
    }, []);

    // ⌘K / Ctrl+K focuses the search input
    useEffect(() => {
      const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current && searchRef.current.focus(); } };
      document.addEventListener('keydown', h);
      return () => document.removeEventListener('keydown', h);
    }, []);

    // ESC closes the full-view detail modal
    useEffect(() => {
      if (!modalOpen) return;
      const h = (e) => { if (e.key === 'Escape') setModalOpen(false); };
      document.addEventListener('keydown', h);
      return () => document.removeEventListener('keydown', h);
    }, [modalOpen]);

    // Close the filter dropdown on outside click (without applying)
    useEffect(() => {
      if (!filterOpen) return;
      const h = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); };
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, [filterOpen]);

    const openFilter = () => { setDrStatus(appStatus); setDrTime(appTime); setFilterOpen(true); };
    const applyFilter = () => { setAppStatus(drStatus); setAppTime(drTime); setFilterOpen(false); };
    const clearFilter = () => { setDrStatus([]); setDrTime('any'); setAppStatus([]); setAppTime('any'); setFilterOpen(false); };
    const toggleStatus = (s) => setDrStatus(drStatus.includes(s) ? drStatus.filter(x => x !== s) : [...drStatus, s]);
    const filtersActive = appStatus.length > 0 || appTime !== 'any';

    const parseDays = (t) => {
      if (/m ago|h ago|just now|now/i.test(t)) return 0;
      if (/yesterday/i.test(t)) return 1;
      const wk = t.match(/(\d+)\s*week/i); if (wk) return +wk[1] * 7;
      const dd = t.match(/(\d+)\s*day/i); if (dd) return +dd[1];
      return 0;
    };

    const base = acct === 'all' ? emails : emails.filter(e => e.accountEmail === acct || e.from === acct);
    const tabs = [['all', 'All', base.length], ['unread', 'Unread', base.filter(e => e.unread).length], ['read', 'Read', base.filter(e => !e.unread).length], ['replied', 'Replied', base.filter(e => e.badge === 'REPLIED').length]];
    let list = base;
    if (tab === 'unread') list = base.filter(e => e.unread);
    else if (tab === 'read') list = base.filter(e => !e.unread);
    else if (tab === 'replied') list = base.filter(e => e.badge === 'REPLIED');
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(e => e.subject.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
    }
    if (appStatus.length) {
      list = list.filter(e => appStatus.some(s =>
        s === 'opened' ? e.badge === 'OPENED' :
        s === 'replied' ? e.badge === 'REPLIED' :
        s === 'sent' ? e.badge === 'SENT' :
        s === 'hot' ? e.opens >= 3 : false));
    }
    if (appTime !== 'any') {
      const maxDays = appTime === 'today' ? 0 : appTime === '7days' ? 7 : 30;
      list = list.filter(e => parseDays(e.time) <= maxDays);
    }
    const email = emails.find(e => e.id === sel);

    return React.createElement('div', { className: 'inbox-wrap' },
      free && banner && React.createElement('div', { className: 'free-banner' },
        React.createElement('span', null, 'Free plan · emails include "Tracked by Peekd"'),
        React.createElement('button', { className: 'banner-link', onClick: onUpgrade }, React.createElement(Icon, { name: 'bolt', size: 13, fill: 'currentColor', stroke: 0 }), 'Remove branding'),
        React.createElement('button', { className: 'banner-x', onClick: () => setBanner(false) }, React.createElement(Icon, { name: 'x', size: 13 })),
      ),
      React.createElement('div', { className: 'inbox' + (effLayout === 'full' ? ' inbox-full' : '') },
        React.createElement('div', { className: 'inbox-list' },
          React.createElement('div', { className: 'inbox-list-head' },
          React.createElement('div', { className: 'flex gap8' },
            React.createElement('div', { className: 'search-input', style: { flex: 1 } },
              React.createElement(Icon, { name: 'search', size: 15 }),
              React.createElement('input', { ref: searchRef, value: query, onChange: e => setQuery(e.target.value), placeholder: 'Search subject, recipient...' }),
              query
                ? React.createElement('button', { className: 'search-clear', onClick: () => { setQuery(''); searchRef.current && searchRef.current.focus(); } }, React.createElement(Icon, { name: 'x', size: 13 }))
                : React.createElement('span', { className: 'kbd' }, '⌘K')),
            React.createElement('div', { className: 'filter-wrap', ref: filterRef },
              React.createElement('button', { className: 'icon-btn' + (filtersActive ? ' has-filter' : ''), style: { width: 38, height: 38 }, onClick: () => filterOpen ? setFilterOpen(false) : openFilter() },
                React.createElement(Icon, { name: 'filter', size: 16 }),
                filtersActive && React.createElement('span', { className: 'filter-dot' })),
              filterOpen && React.createElement('div', { className: 'filter-panel' },
                React.createElement('div', { className: 'fp-title' }, 'FILTER BY'),
                React.createElement('div', { className: 'fp-group' }, 'Status'),
                [['opened', 'Opened'], ['replied', 'Replied'], ['sent', 'Sent (not opened)'], ['hot', 'Hot (3+ opens)']].map(([k, lbl]) =>
                  React.createElement('label', { key: k, className: 'fp-opt', onClick: () => toggleStatus(k) },
                    React.createElement('span', { className: 'checkbox' + (drStatus.includes(k) ? ' on' : '') }, drStatus.includes(k) && React.createElement(Icon, { name: 'check', size: 12 })),
                    lbl)),
                React.createElement('div', { className: 'fp-group' }, 'Time'),
                [['any', 'Any time'], ['today', 'Today'], ['7days', 'Last 7 days'], ['30days', 'Last 30 days']].map(([k, lbl]) =>
                  React.createElement('label', { key: k, className: 'fp-opt', onClick: () => setDrTime(k) },
                    React.createElement('span', { className: 'radio-dot' + (drTime === k ? ' on' : '') }),
                    lbl)),
                React.createElement('div', { className: 'fp-foot' },
                  React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: clearFilter }, 'Clear filters'),
                  React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: applyFilter }, 'Apply')),
              ),
            ),
            layout === 'full' && React.createElement('button', { className: 'icon-btn has-filter', style: { width: 38, height: 38 }, title: 'Switch to split view', onClick: toggleLayout }, React.createElement(Icon, { name: 'inbox', size: 16 })),          ),
          React.createElement('div', { className: 'tabs', style: { marginTop: 10 } },
            tabs.map(([id, label, n]) => React.createElement('button', { key: id, className: 'tab' + (tab === id ? ' active' : ''), onClick: () => setTab(id) },
              label, React.createElement('span', { className: 'tab-count' }, n))),
          ),
          React.createElement('div', { className: 'flex between center', style: { marginTop: 10 } },
            React.createElement('span', { className: 'muted', style: { fontSize: 12 } },
              inboxStatus === 'loading' ? 'Loading Gmail…' : list.length + ' threads'),
            inboxStatus === 'ready' && React.createElement('span', { className: 'live' }, React.createElement('span', { className: 'blip' }), 'Gmail sync'),
          ),
        ),
        React.createElement('div', { className: 'inbox-rows' },
          inboxStatus === 'no_account'
            ? React.createElement('div', { className: 'inbox-empty' },
                React.createElement(Icon, { name: 'mail', size: 30 }),
                React.createElement('div', { className: 'ie-title' }, 'Connect Gmail to see your inbox'),
                React.createElement('div', { className: 'ie-sub' }, 'Go to Settings → Integrations and connect your account'))
            : inboxStatus === 'loading'
              ? React.createElement('div', { className: 'inbox-empty' },
                  React.createElement('div', { className: 'ie-sub' }, 'Loading messages from Gmail…'))
              : list.length === 0
            ? React.createElement('div', { className: 'inbox-empty' },
                React.createElement(Icon, { name: 'search', size: 30 }),
                React.createElement('div', { className: 'ie-title' }, query.trim() ? 'No results for "' + query.trim() + '"' : 'No matching emails'),
                React.createElement('div', { className: 'ie-sub' }, query.trim() ? 'Try a different name or subject' : 'Try adjusting your filters'))
            : list.map(e => React.createElement(EmailRow, { key: e.id, e, wide: effLayout === 'full', active: e.id === sel && effLayout === 'split' && !isMobile, onClick: () => { setSel(e.id); if (isMobile) setMobileDetail(true); else if (layout === 'full') setModalOpen(true); } })),
        ),
      ),
        effLayout === 'split' && React.createElement(Detail, { e: email, free, onUpgrade, onCompose, toast, layout, onToggleLayout: toggleLayout, mobileDetail, onMobileBack: () => setMobileDetail(false) }),
      ),
      effLayout === 'full' && modalOpen && email && React.createElement('div', { className: 'detail-modal-bg', onMouseDown: () => setModalOpen(false) },
        React.createElement('div', { className: 'detail-modal', onMouseDown: ev => ev.stopPropagation() },
          React.createElement('button', { className: 'detail-modal-close', onClick: () => setModalOpen(false) }, React.createElement(Icon, { name: 'x', size: 16 }), 'Close'),
          React.createElement(Detail, { e: email, free, onUpgrade, onCompose, toast, layout, onToggleLayout: toggleLayout }),
        )),
    );
  }

  window.InboxPage = InboxPage;
})();
