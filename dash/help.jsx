// Peekd dashboard — Help & docs page (knowledge base + support tickets).
(function () {
  const { useState, useRef, useEffect } = React;
  const Icon = window.Icon;

  const KB = [
    { cat: 'Getting Started', items: [
      { t: 'How to connect Gmail', body: [
        'Open Settings → Integrations and click Connect next to Gmail. You\'ll be redirected to Google\'s secure sign-in to grant Peekd permission to send and track from your account.',
        'Peekd only requests the scopes needed to inject tracking pixels and detect opens — it never reads the body of your messages. You can connect multiple Gmail accounts and pick a primary one.' ] },
      { t: 'How to connect Outlook', body: [
        'From Settings → Integrations, click Connect beside Outlook and authorize through Microsoft\'s login. Once linked, every email you send from Outlook web can be tracked automatically.',
        'If your organization uses conditional access, you may need an admin to approve Peekd the first time. Reach out to support and we\'ll send the exact consent link your admin needs.' ] },
      { t: 'Sending your first tracked email', body: [
        'Hit Compose, write your message, and make sure the Track toggle is on before sending. Peekd silently adds an invisible pixel so you\'ll know the moment it\'s opened.',
        'Your sent email appears in the Inbox view with a live status — Active, Replied, or Unresponsive — and a full Activity Timeline of every open and click.' ] },
      { t: 'Understanding the Activity Timeline', body: [
        'The Activity Timeline is the chronological log on every tracked email. Each open, re-open, and link click is stamped with a time so you can read intent at a glance.',
        'A burst of opens in a short window usually means your email is being shared internally or revisited before a decision — a strong signal it\'s a good time to follow up.' ] },
    ]},
    { cat: 'Tracking & Inbox', items: [
      { t: 'How does the tracking pixel work?', body: [
        'When tracking is on, Peekd embeds a tiny transparent image in your email. When the recipient\'s mail client loads that image, our server records an open event and notifies you.',
        'Because it relies on images loading, opens are detected only when the recipient has images enabled. Most modern clients load them by default, but a few privacy modes pre-fetch or block them.' ] },
      { t: 'Why isn\'t my email showing as opened?', body: [
        'A few things can suppress an open: the recipient has images turned off, their company proxy strips remote content, or they\'re reading in a plain-text client.',
        'Apple Mail Privacy Protection can also pre-load pixels, which may show an open that didn\'t happen — or mask the real one. We flag likely proxy opens in the timeline so you can judge accordingly.' ] },
      { t: 'What is "Opened again"?', body: [
        '"Opened again" means the same recipient loaded your email more than once. Each re-open is its own entry on the timeline with a fresh timestamp.',
        'Repeat opens are one of the strongest buying signals in Peekd — someone returning to your message is actively considering it. The Daily Digest surfaces your hottest repeat-openers each morning.' ] },
      { t: 'Link click tracking explained', body: [
        'With link tracking enabled, Peekd wraps the URLs in your email so a click is counted before the recipient is instantly redirected to the real destination.',
        'Click data appears alongside opens in the timeline and feeds the Top Clicked Links report in Analytics, so you can see which resources actually drive engagement.' ] },
    ]},
    { cat: 'Campaigns', items: [
      { t: 'Creating your first campaign', body: [
        'Go to Campaigns → Create campaign. Choose recipients (or a saved List), write your sequence of steps, and set the wait time between each. Peekd handles the sending cadence for you.',
        'Every step is tracked individually, so you can watch open and reply rates climb step by step and adjust the messaging that isn\'t landing.' ] },
      { t: 'How auto-pause on reply works', body: [
        'When a recipient replies, Peekd automatically removes them from the remaining steps of the campaign — no more awkward follow-ups to someone who already responded.',
        'You can see exactly who was auto-paused on the campaign detail page, and re-add anyone manually if a conversation stalls.' ] },
      { t: 'Using People Lists in campaigns', body: [
        'Group contacts into a List on the People page, then select that List as the audience when you build a campaign. Updating the List later won\'t retro-add people to a running campaign.',
        'Lists are reusable across campaigns, which makes it easy to run the same sequence against, say, "Enterprise Leads" each quarter.' ] },
    ]},
    { cat: 'Billing & Plans', items: [
      { t: 'Free vs Pro — what\'s included', body: [
        'Free covers core open tracking and a single connected inbox. Pro unlocks Lists, multi-step Campaigns, link-click tracking, the Top Links report, location data, and the morning Daily Digest.',
        'You can try everything on Pro and downgrade any time — your data stays intact, only the Pro-only features lock.' ] },
      { t: 'How to upgrade to Pro', body: [
        'Click Upgrade anywhere you see it (or the banner in the sidebar), confirm your plan, and Pro features unlock instantly. Pro is $7/month, billed monthly.',
        'Switching is immediate — campaigns and Lists you\'ve previewed become fully usable the moment you upgrade.' ] },
      { t: 'Cancel or change your plan', body: [
        'Manage your subscription from Settings → Account. You can switch between monthly and annual billing or cancel — access continues until the end of the period you\'ve paid for.',
        'Need a hand or a refund? Open a ticket below and we\'ll sort it out within a few hours.' ] },
    ]},
  ];

  const SUPPORT_CATS = ['Bug report', 'Billing question', 'Feature request', 'Account issue', 'Other'];

  // ── Left: Knowledge base ──────────────────────────────────────
  function KnowledgeBase({ toast }) {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(null);
    const [voted, setVoted] = useState(null);
    const inputRef = useRef(null);
    useEffect(() => { if (inputRef.current && !active) inputRef.current.focus(); }, [active]);

    if (active) {
      return React.createElement('div', { className: 'kb-col' },
        React.createElement('div', { className: 'kb-article' },
          React.createElement('button', { className: 'kb-back', onClick: () => setActive(null) },
            React.createElement(Icon, { name: 'chevLeft', size: 15 }), 'Back'),
          React.createElement('div', { className: 'kb-art-cat' }, active.cat),
          React.createElement('h1', null, active.t),
          active.body.map((p, i) => React.createElement('p', { key: i }, p)),
          React.createElement('div', { className: 'kb-art-foot' },
            voted
              ? React.createElement('span', { className: 'kb-voted' }, React.createElement(Icon, { name: 'check', size: 14 }), voted === 'yes' ? 'Thanks for your feedback!' : 'Thanks — we\'ll work on making this clearer.')
              : React.createElement(React.Fragment, null,
                  React.createElement('span', null, 'Was this helpful?'),
                  React.createElement('button', { className: 'kb-vote', onClick: () => { setVoted('yes'); toast && toast('Thanks for your feedback ✓'); } }, '👍 Yes'),
                  React.createElement('button', { className: 'kb-vote', onClick: () => { setVoted('no'); toast && toast('Thanks — we\'ll improve this ✓'); } }, '👎 No'))),
        ),
      );
    }

    const q = query.trim().toLowerCase();
    const groups = KB.map(g => ({ cat: g.cat, items: q ? g.items.filter(a => a.t.toLowerCase().includes(q)) : g.items })).filter(g => g.items.length);

    return React.createElement('div', { className: 'kb-col' },
      React.createElement('div', { className: 'kb-head' },
        React.createElement('h2', null, React.createElement(Icon, { name: 'book', size: 18 }), 'Knowledge Base'),
        React.createElement('p', { className: 'kb-sub' }, 'Find answers to common questions')),
      React.createElement('div', { className: 'search-input kb-search' },
        React.createElement(Icon, { name: 'search', size: 16 }),
        React.createElement('input', { ref: inputRef, placeholder: 'Search docs...', value: query, onChange: e => setQuery(e.target.value) })),
      groups.length === 0
        ? React.createElement('div', { className: 'kb-empty' }, 'No articles match “' + query + '”. Try a different term, or open a ticket.')
        : groups.map(g => React.createElement('div', { key: g.cat, className: 'kb-group' },
            React.createElement('div', { className: 'kb-cat' }, g.cat),
            React.createElement('div', { className: 'kb-card' },
              g.items.map((a) => React.createElement('button', { key: a.t, className: 'kb-row', onClick: () => { setVoted(null); setActive({ ...a, cat: g.cat }); } },
                React.createElement('span', { className: 'kb-arrow' }, '→'),
                React.createElement('span', { className: 'kb-title' }, a.t)))),
          )),
    );
  }

  // ── Category dropdown ─────────────────────────────────────────
  function CatSelect({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, [open]);
    return React.createElement('div', { ref, style: { position: 'relative' } },
      React.createElement('button', { className: 'select', style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, onClick: () => setOpen(o => !o) },
        React.createElement('span', { style: value ? null : { color: 'var(--fg-mute)' } }, value || 'Select a category...'),
        React.createElement(Icon, { name: 'chevDown', size: 14 })),
      open && React.createElement('div', { className: 'card', style: { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 20, padding: 5, boxShadow: 'var(--shadow-lg)' } },
        SUPPORT_CATS.map(c => React.createElement('button', { key: c, className: 'check-line' + (c === value ? ' sel' : ''), style: { width: '100%' }, onClick: () => { onChange(c); setOpen(false); } }, c))),
    );
  }

  // ── Right: Support tickets ────────────────────────────────────
  const TK_STATUS = { open: { label: 'Open', cls: 'tk-open' }, progress: { label: 'In progress', cls: 'tk-progress' }, resolved: { label: 'Resolved', cls: 'tk-resolved' } };
  const fmtFileSize = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

  function ticketErrorMessage(error) {
    if (error === 'attachment_too_large') return 'Attachment is too large (max 10 MB).';
    if (error === 'invalid_attachment_type') return 'Only PNG, JPG, and PDF files are allowed.';
    if (error === 'no_session') return 'Sign in to open a support ticket.';
    return 'Could not save your ticket. Try again.';
  }

  function TicketForm({ onSubmit, submitting }) {
    const [subject, setSubject] = useState('');
    const [cat, setCat] = useState('');
    const [desc, setDesc] = useState('');
    const [file, setFile] = useState(null);
    const [drag, setDrag] = useState(false);
    const fileRef = useRef(null);
    const maxBytes = window.PeekdTickets?.MAX_FILE_BYTES || 10 * 1024 * 1024;
    const pick = (f) => {
      if (!f) return;
      if (f.size > maxBytes) return;
      setFile(f);
    };
    const canSubmit = subject.trim() && desc.trim() && !submitting;
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'field', style: { marginBottom: 14 } },
        React.createElement('label', { className: 'field-label' }, 'SUBJECT'),
        React.createElement('input', { className: 'input', placeholder: 'What\'s this about?', value: subject, onChange: e => setSubject(e.target.value), disabled: submitting })),
      React.createElement('div', { className: 'field', style: { marginBottom: 14 } },
        React.createElement('label', { className: 'field-label' }, 'CATEGORY'),
        React.createElement(CatSelect, { value: cat, onChange: setCat })),
      React.createElement('div', { className: 'field', style: { marginBottom: 14 } },
        React.createElement('label', { className: 'field-label' }, 'DESCRIPTION'),
        React.createElement('textarea', { className: 'textarea', style: { minHeight: 120 }, placeholder: 'Describe your issue...', value: desc, onChange: e => setDesc(e.target.value), disabled: submitting })),
      React.createElement('div', { className: 'field', style: { marginBottom: 18 } },
        React.createElement('label', { className: 'field-label' }, 'ATTACHMENT (OPTIONAL)'),
        React.createElement('input', { ref: fileRef, type: 'file', accept: '.png,.jpg,.jpeg,.pdf', style: { display: 'none' }, onChange: e => pick(e.target.files[0]) }),
        file
          ? React.createElement('div', { className: 'file-chip' },
              React.createElement('span', { className: 'fc-ico' }, React.createElement(Icon, { name: 'image', size: 16 })),
              React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', { className: 'fc-name' }, file.name),
                React.createElement('div', { className: 'fc-size' }, fmtFileSize(file.size))),
              React.createElement('button', { className: 'row-act', onClick: () => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }, disabled: submitting }, React.createElement(Icon, { name: 'x', size: 14 })))
          : React.createElement('div', {
              className: 'help-drop' + (drag ? ' drag' : ''),
              onClick: () => fileRef.current && fileRef.current.click(),
              onDragOver: e => { e.preventDefault(); setDrag(true); },
              onDragLeave: () => setDrag(false),
              onDrop: e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); },
            },
              React.createElement('div', { className: 'hd-main' }, '📎 Drop file or browse'),
              React.createElement('div', { className: 'hd-sub' }, 'PNG, JPG, PDF — max 10MB'))),
      React.createElement('button', { className: 'btn btn-primary', style: { width: '100%' }, disabled: !canSubmit, onClick: () => onSubmit({ subject, cat, desc, file }) },
        submitting ? 'Opening ticket…' : 'Open ticket ', !submitting && React.createElement(Icon, { name: 'arrowRight', size: 15 })),
    );
  }

  function TicketList({ tickets, loading, onOpen }) {
    if (loading) return React.createElement('p', { className: 'dim', style: { padding: '8px 2px' } }, 'Loading tickets…');
    if (!tickets.length) return React.createElement('div', { className: 'tk-empty' },
      React.createElement('div', { className: 'tk-empty-ico' }, React.createElement(Icon, { name: 'messageSquare', size: 22 })),
      React.createElement('p', null, 'No tickets yet. Open one and it\'ll show up here.'));
    return React.createElement('div', { className: 'ticket-list' },
      tickets.map(t => React.createElement('button', { key: t.id, className: 'ticket-card', onClick: () => onOpen(t.id) },
        React.createElement('div', { className: 'tk-top' },
          React.createElement('span', { className: 'tk-subject' }, t.subject),
          React.createElement('span', { className: 'tk-status ' + TK_STATUS[t.status].cls }, TK_STATUS[t.status].label)),
        React.createElement('div', { className: 'tk-meta' }, '#' + t.number + '  ·  ' + t.category + '  ·  ' + t.created),
      )),
    );
  }

  function TicketDetail({ tk, loading, onBack, onReply }) {
    const [reply, setReply] = useState('');
    const [rfile, setRfile] = useState(null);
    const [sending, setSending] = useState(false);
    const rfileRef = useRef(null);
    const maxBytes = window.PeekdTickets?.MAX_FILE_BYTES || 10 * 1024 * 1024;
    const pick = (f) => { if (!f || f.size > maxBytes) return; setRfile(f); };
    const send = async () => {
      const v = reply.trim();
      if ((!v && !rfile) || sending) return;
      setSending(true);
      await onReply({ text: v, file: rfile });
      setSending(false);
      setReply('');
      setRfile(null);
      if (rfileRef.current) rfileRef.current.value = '';
    };

    if (loading || !tk) return React.createElement('div', null,
      React.createElement('button', { className: 'kb-back', onClick: onBack }, React.createElement(Icon, { name: 'chevLeft', size: 15 }), 'All tickets'),
      React.createElement('p', { className: 'dim', style: { padding: '12px 2px' } }, 'Loading ticket…'));

    const renderFile = (file) => file && React.createElement(file.url ? 'a' : 'span', {
      className: 'tk-bubble-file',
      ...(file.url ? { href: file.url, target: '_blank', rel: 'noopener noreferrer' } : {}),
    }, React.createElement(Icon, { name: 'image', size: 13 }), file.name);

    return React.createElement('div', null,
      React.createElement('button', { className: 'kb-back', onClick: onBack }, React.createElement(Icon, { name: 'chevLeft', size: 15 }), 'All tickets'),
      React.createElement('div', { className: 'tk-detail-head' },
        React.createElement('span', { className: 'tk-status ' + TK_STATUS[tk.status].cls }, TK_STATUS[tk.status].label),
        React.createElement('h3', null, tk.subject),
        React.createElement('div', { className: 'tk-meta' }, '#' + tk.number + '  ·  ' + tk.category + '  ·  Opened ' + tk.created)),
      React.createElement('div', { className: 'tk-thread' },
        (tk.thread || []).map((m, i) => React.createElement('div', { key: m.id || i, className: 'tk-msg ' + (m.from === 'you' ? 'tk-me' : 'tk-them') },
          React.createElement('div', { className: 'tk-msg-head' },
            React.createElement('span', { className: 'tk-msg-name' }, m.from === 'you' ? 'You' : (m.name || 'Peekd Support')),
            React.createElement('span', { className: 'tk-msg-time' }, m.time)),
          React.createElement('div', { className: 'tk-bubble' },
            m.text && React.createElement('span', null, m.text),
            renderFile(m.file)))),
      React.createElement('div', { className: 'tk-reply' },
        React.createElement('textarea', { className: 'textarea', style: { minHeight: 70 }, placeholder: 'Write a reply...', value: reply, onChange: e => setReply(e.target.value), disabled: sending }),
        rfile && React.createElement('div', { className: 'file-chip' },
          React.createElement('span', { className: 'fc-ico' }, React.createElement(Icon, { name: 'image', size: 16 })),
          React.createElement('div', { style: { flex: 1, minWidth: 0 } },
            React.createElement('div', { className: 'fc-name' }, rfile.name),
            React.createElement('div', { className: 'fc-size' }, fmtFileSize(rfile.size))),
          React.createElement('button', { className: 'row-act', onClick: () => { setRfile(null); if (rfileRef.current) rfileRef.current.value = ''; }, disabled: sending }, React.createElement(Icon, { name: 'x', size: 14 }))),
        React.createElement('input', { ref: rfileRef, type: 'file', accept: '.png,.jpg,.jpeg,.pdf', style: { display: 'none' }, onChange: e => pick(e.target.files[0]), disabled: sending }),
        React.createElement('div', { className: 'tk-reply-actions' },
          React.createElement('button', { className: 'tk-attach-btn', onClick: () => rfileRef.current && rfileRef.current.click(), disabled: sending }, React.createElement(Icon, { name: 'paperclip', size: 14 }), 'Attach'),
          React.createElement('button', { className: 'btn btn-primary btn-sm', disabled: sending || (!reply.trim() && !rfile), onClick: send }, sending ? 'Sending…' : 'Send reply'))),
    );
  }

  function SupportPanel({ toast }) {
    const [tickets, setTickets] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loadingList, setLoadingList] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [mode, setMode] = useState('form');
    const [selId, setSelId] = useState(null);

    async function loadTickets() {
      if (!window.PeekdTickets?.fetchTickets) {
        setTickets([]);
        setLoadingList(false);
        return;
      }
      setLoadingList(true);
      const res = await window.PeekdTickets.fetchTickets();
      setLoadingList(false);
      if (!res.ok) {
        setTickets([]);
        return;
      }
      setTickets(res.tickets || []);
    }

    async function loadTicket(id) {
      if (!window.PeekdTickets?.fetchTicket) return;
      setLoadingDetail(true);
      const res = await window.PeekdTickets.fetchTicket(id);
      setLoadingDetail(false);
      if (res.ok) setSelected(res.ticket);
    }

    useEffect(() => { loadTickets(); }, []);

    useEffect(() => {
      if (mode === 'detail' && selId) loadTicket(selId);
    }, [mode, selId]);

    const createTicket = async ({ subject, cat, desc, file }) => {
      if (!window.PeekdTickets?.createTicket) return;
      setSubmitting(true);
      const res = await window.PeekdTickets.createTicket({
        subject,
        category: cat || 'Other',
        description: desc,
        file,
      });
      setSubmitting(false);
      if (!res.ok) {
        toast && toast(ticketErrorMessage(res.error));
        return;
      }
      await loadTickets();
      setSelected(res.ticket);
      setSelId(res.ticket.id);
      setMode('detail');
      toast && toast('Ticket opened ✓');
    };

    const addReply = async ({ text, file }) => {
      if (!selId || !window.PeekdTickets?.replyToTicket) return;
      const res = await window.PeekdTickets.replyToTicket(selId, { text, file });
      if (!res.ok) {
        toast && toast(ticketErrorMessage(res.error));
        return;
      }
      await loadTicket(selId);
      toast && toast('Reply sent ✓');
    };

    return React.createElement('div', null,
      React.createElement('div', { className: 'support-card' },
        React.createElement('div', { className: 'kb-head', style: { marginBottom: 14 } },
          React.createElement('h2', null, React.createElement(Icon, { name: 'messageSquare', size: 18 }), 'Contact Support'),
          React.createElement('p', { className: 'kb-sub' }, 'Can\'t find what you need? We\'re here.')),
        mode !== 'detail' && React.createElement('div', { className: 'tabs', style: { width: 'fit-content', marginBottom: 16 } },
          React.createElement('button', { className: 'tab' + (mode === 'form' ? ' active' : ''), onClick: () => setMode('form') }, 'New ticket'),
          React.createElement('button', { className: 'tab' + (mode === 'list' ? ' active' : ''), onClick: () => setMode('list') }, 'My tickets', React.createElement('span', { className: 'tab-count' }, tickets.length))),
        mode === 'form' && React.createElement(TicketForm, { onSubmit: createTicket, submitting }),
        mode === 'list' && React.createElement(TicketList, { tickets, loading: loadingList, onOpen: (id) => { setSelId(id); setMode('detail'); } }),
        mode === 'detail' && React.createElement(TicketDetail, { tk: selected, loading: loadingDetail, onBack: () => setMode('list'), onReply: addReply })),
      React.createElement('div', { className: 'support-foot' },
        React.createElement('div', null, 'Typical reply time: ', React.createElement('b', null, 'under 24 hours'))),
    );
  }

  function HelpPage({ toast }) {
    return React.createElement('div', { className: 'page-pad' },
      React.createElement('div', { className: 'help-wrap' },
        React.createElement(KnowledgeBase, { toast }),
        React.createElement(SupportPanel, { toast }),
      ),
    );
  }

  window.HelpPage = HelpPage;
})();
