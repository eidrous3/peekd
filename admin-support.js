(function () {
  const { useState, useEffect } = React;
  const TK_STATUS = {
    open: { label: 'Open', cls: 'tk-open' },
    progress: { label: 'In progress', cls: 'tk-progress' },
    resolved: { label: 'Resolved', cls: 'tk-resolved' },
  };
  const TOKEN_KEY = 'peekd_admin_support_token';
  const MAX_FILE_BYTES = 10 * 1024 * 1024;

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function filePayload(file) {
    if (!file) return null;
    if (file.size > MAX_FILE_BYTES) throw new Error('attachment_too_large');
    return {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: await readFileAsBase64(file),
    };
  }

  async function adminFetch(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': token,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || 'request_failed');
    return data;
  }

  function Login({ onLogin }) {
    const [email, setEmail] = useState('hello@getpeekd.com');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function submit(e) {
      e.preventDefault();
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/.netlify/functions/admin-support-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setError(data.error === 'admin_not_configured' ? 'Admin login is not configured on the server.' : 'Invalid email or password.');
          return;
        }
        sessionStorage.setItem(TOKEN_KEY, data.token);
        onLogin(data.token);
      } catch {
        setError('Could not sign in. Try again.');
      } finally {
        setLoading(false);
      }
    }

    return React.createElement('div', { className: 'admin-login-wrap' },
      React.createElement('form', { className: 'card admin-login', onSubmit: submit },
        React.createElement('h1', null, 'Peekd Support Admin'),
        React.createElement('p', { className: 'dim', style: { marginBottom: 18 } }, 'Sign in to view and reply to support tickets.'),
        React.createElement('div', { className: 'field', style: { marginBottom: 14 } },
          React.createElement('label', { className: 'field-label' }, 'EMAIL'),
          React.createElement('input', { className: 'input', type: 'email', value: email, onChange: (e) => setEmail(e.target.value), disabled: loading })),
        React.createElement('div', { className: 'field', style: { marginBottom: 18 } },
          React.createElement('label', { className: 'field-label' }, 'PASSWORD'),
          React.createElement('input', { className: 'input', type: 'password', value: password, onChange: (e) => setPassword(e.target.value), disabled: loading })),
        error && React.createElement('p', { style: { color: 'var(--danger)', fontSize: 13, marginBottom: 12 } }, error),
        React.createElement('button', { className: 'btn btn-primary', style: { width: '100%' }, disabled: loading }, loading ? 'Signing in…' : 'Sign in'),
      ),
    );
  }

  function TicketList({ tickets, selectedId, onSelect }) {
    return React.createElement('div', { className: 'admin-ticket-list' },
      tickets.map((t) => React.createElement('button', {
        key: t.id,
        className: 'ticket-card' + (t.id === selectedId ? ' on' : ''),
        onClick: () => onSelect(t.id),
      },
        React.createElement('div', { className: 'tk-top' },
          React.createElement('span', { className: 'tk-subject' }, t.subject),
          React.createElement('span', { className: 'tk-status ' + TK_STATUS[t.status].cls }, TK_STATUS[t.status].label)),
        React.createElement('div', { className: 'tk-meta' }, '#' + t.number + ' · ' + (t.userEmail || 'user') + ' · ' + t.created),
      )),
    );
  }

  function TicketPanel({ ticket, token, onUpdated }) {
    const [reply, setReply] = useState('');
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState(ticket?.status || 'open');
    const [sending, setSending] = useState(false);
    const fileRef = React.useRef(null);

    useEffect(() => {
      setStatus(ticket?.status || 'open');
      setReply('');
      setFile(null);
    }, [ticket?.id]);

    if (!ticket) return React.createElement('div', { className: 'admin-empty' }, 'Select a ticket to view the conversation.');

    async function sendReply() {
      if ((!reply.trim() && !file) || sending) return;
      setSending(true);
      try {
        const attachment = file ? await filePayload(file) : null;
        await adminFetch(`/.netlify/functions/admin-support-tickets?id=${encodeURIComponent(ticket.id)}`, {
          method: 'POST',
          token,
          body: { text: reply.trim(), attachment, status },
        });
        setReply('');
        setFile(null);
        if (fileRef.current) fileRef.current.value = '';
        await onUpdated(ticket.id);
      } catch (err) {
        alert(err.message === 'attachment_too_large' ? 'Attachment is too large (max 10 MB).' : 'Could not send reply.');
      } finally {
        setSending(false);
      }
    }

    async function updateStatus(next) {
      setStatus(next);
      try {
        await adminFetch(`/.netlify/functions/admin-support-tickets?id=${encodeURIComponent(ticket.id)}`, {
          method: 'PATCH',
          token,
          body: { status: next },
        });
        await onUpdated(ticket.id);
      } catch {
        alert('Could not update status.');
      }
    }

    return React.createElement('div', { className: 'admin-ticket-panel' },
      React.createElement('div', { className: 'tk-detail-head' },
        React.createElement('span', { className: 'tk-status ' + TK_STATUS[ticket.status].cls }, TK_STATUS[ticket.status].label),
        React.createElement('h3', null, ticket.subject),
        React.createElement('div', { className: 'tk-meta' }, '#' + ticket.number + ' · ' + ticket.category + ' · ' + (ticket.userEmail || '')),
        React.createElement('div', { className: 'admin-status-row' },
          ['open', 'progress', 'resolved'].map((s) => React.createElement('button', {
            key: s,
            className: 'btn btn-ghost btn-sm' + (status === s ? ' active' : ''),
            onClick: () => updateStatus(s),
          }, TK_STATUS[s].label)),
        )),
      React.createElement('div', { className: 'tk-thread' },
        (ticket.thread || []).map((m, i) => React.createElement('div', { key: m.id || i, className: 'tk-msg ' + (m.from === 'you' ? 'tk-me' : 'tk-them') },
          React.createElement('div', { className: 'tk-msg-head' },
            React.createElement('span', { className: 'tk-msg-name' }, m.from === 'you' ? (ticket.userEmail || 'User') : (m.name || 'Peekd Support')),
            React.createElement('span', { className: 'tk-msg-time' }, m.time)),
          React.createElement('div', { className: 'tk-bubble' },
            m.text && React.createElement('span', null, m.text),
            m.file && (m.file.url
              ? React.createElement('a', { className: 'tk-bubble-file', href: m.file.url, target: '_blank', rel: 'noopener noreferrer' }, '📎 ', m.file.name)
              : React.createElement('span', { className: 'tk-bubble-file' }, '📎 ', m.file.name))))),
      React.createElement('div', { className: 'tk-reply' },
        React.createElement('textarea', { className: 'textarea', style: { minHeight: 90 }, placeholder: 'Write a reply as Peekd Support...', value: reply, onChange: (e) => setReply(e.target.value), disabled: sending }),
        file && React.createElement('div', { className: 'file-chip', style: { marginTop: 10 } },
          React.createElement('div', { className: 'fc-name' }, file.name),
          React.createElement('button', { className: 'row-act', onClick: () => { setFile(null); if (fileRef.current) fileRef.current.value = ''; } }, '×')),
        React.createElement('input', { ref: fileRef, type: 'file', accept: '.png,.jpg,.jpeg,.pdf', style: { display: 'none' }, onChange: (e) => setFile(e.target.files[0] || null) }),
        React.createElement('div', { className: 'tk-reply-actions' },
          React.createElement('button', { className: 'tk-attach-btn', onClick: () => fileRef.current && fileRef.current.click(), disabled: sending }, 'Attach'),
          React.createElement('button', { className: 'btn btn-primary btn-sm', disabled: sending || (!reply.trim() && !file), onClick: sendReply }, sending ? 'Sending…' : 'Send reply'),
        ),
      ),
    );
  }

  function AdminApp() {
    const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
    const [tickets, setTickets] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(false);

    async function loadTickets(activeToken = token) {
      setLoading(true);
      try {
        const data = await adminFetch('/.netlify/functions/admin-support-tickets', { token: activeToken });
        setTickets(data.tickets || []);
      } catch {
        setTickets([]);
        sessionStorage.removeItem(TOKEN_KEY);
        setToken('');
      } finally {
        setLoading(false);
      }
    }

    async function loadTicket(id, activeToken = token) {
      const data = await adminFetch(`/.netlify/functions/admin-support-tickets?id=${encodeURIComponent(id)}`, { token: activeToken });
      setSelected(data.ticket);
      setSelectedId(id);
    }

    useEffect(() => {
      if (token) loadTickets(token);
    }, [token]);

    function logout() {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken('');
      setTickets([]);
      setSelected(null);
      setSelectedId(null);
    }

    if (!token) return React.createElement(Login, { onLogin: (t) => { setToken(t); loadTickets(t); } });

    return React.createElement('div', { className: 'admin-shell' },
      React.createElement('header', { className: 'admin-head' },
        React.createElement('div', null,
          React.createElement('h1', null, 'Support Admin'),
          React.createElement('p', { className: 'dim' }, tickets.length + ' tickets')),
        React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: logout }, 'Log out'),
      ),
      React.createElement('div', { className: 'admin-grid' },
        React.createElement('div', { className: 'admin-side card' },
          loading
            ? React.createElement('p', { className: 'dim', style: { padding: 16 } }, 'Loading…')
            : tickets.length === 0
              ? React.createElement('p', { className: 'dim', style: { padding: 16 } }, 'No tickets yet.')
              : React.createElement(TicketList, { tickets, selectedId, onSelect: (id) => loadTicket(id) }),
        ),
        React.createElement('div', { className: 'admin-main card' },
          React.createElement(TicketPanel, {
            ticket: selected,
            token,
            onUpdated: async (id) => { await loadTickets(); await loadTicket(id); },
          }),
        ),
      ),
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(AdminApp));
})();
