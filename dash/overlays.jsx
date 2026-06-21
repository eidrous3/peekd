// Peekd dashboard — shared overlays: Compose, Upgrade, Notifications drawer.
(function () {
  const { useState, useRef } = React;
  const Icon = window.Icon;
  const { Avatar } = window;
  const D = window.PeekdData;

  const MAX_FILE_BYTES = 3 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

  function fmtFileSize(b) {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${Math.round(b / 1024)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function Compose({ free, onClose, onUpgrade, toast, initialBody }) {
    const [to, setTo] = useState([]);
    const [draft, setDraft] = useState('');
    const [fromOpen, setFromOpen] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [from, setFrom] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState(initialBody || '');
    const [attachments, setAttachments] = useState([]);
    const [sending, setSending] = useState(false);
    const [accountsLoading, setAccountsLoading] = useState(true);
    const fileRef = useRef(null);

    React.useEffect(() => { const k = e => e.key === 'Escape' && !sending && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [sending, onClose]);

    React.useEffect(() => {
      if (initialBody) setBody(initialBody);
    }, [initialBody]);

    React.useEffect(() => {
      let cancelled = false;
      (async () => {
        if (!window.PeekdIntegrations?.fetchGmailAccounts) {
          setAccountsLoading(false);
          return;
        }
        const res = await window.PeekdIntegrations.fetchGmailAccounts();
        if (cancelled) return;
        const list = res.ok ? (res.accounts || []) : [];
        setAccounts(list);
        const primary = list.find((a) => a.is_primary) || list[0];
        if (primary) setFrom(primary.email);
        setAccountsLoading(false);
      })();
      return () => { cancelled = true; };
    }, []);

    const addEmail = (e) => {
      if ((e.key === 'Enter' || e.key === ',') && draft.trim()) {
        e.preventDefault();
        const em = draft.trim().toLowerCase();
        if (!to.includes(em)) setTo([...to, em]);
        setDraft('');
      }
    };
    const bad = draft && !validEmail(draft);
    const allTo = draft.trim() && validEmail(draft.trim()) ? [...to, draft.trim().toLowerCase()] : to;
    const hasBody = body.replace(/<[^>]+>/g, '').trim();
    const canSend = from && allTo.length > 0 && subject.trim() && (hasBody || attachments.length > 0);

    async function addFiles(fileList) {
      if (!fileList?.length || sending) return;
      const next = [...attachments];
      let totalSize = next.reduce((sum, file) => sum + file.size, 0);

      for (const file of fileList) {
        if (file.size > MAX_FILE_BYTES) {
          toast(`"${file.name}" is too large (max 3 MB)`);
          continue;
        }
        if (totalSize + file.size > MAX_TOTAL_BYTES) {
          toast('Attachments exceed 3 MB total');
          break;
        }
        try {
          const data = await readFileAsBase64(file);
          next.push({
            id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
            data,
          });
          totalSize += file.size;
        } catch {
          toast(`Could not read "${file.name}"`);
        }
      }

      setAttachments(next);
      if (fileRef.current) fileRef.current.value = '';
    }

    function removeAttachment(id) {
      setAttachments(attachments.filter((file) => file.id !== id));
    }

    async function handleSend() {
      if (!canSend || sending || !window.PeekdGmail?.sendEmail) return;
      setSending(true);
      const res = await window.PeekdGmail.sendEmail({
        fromEmail: from,
        to: allTo,
        subject: subject.trim(),
        html: body,
        addBranding: free,
        attachments: attachments.map((file) => ({
          filename: file.name,
          mimeType: file.mimeType,
          data: file.data,
        })),
      });
      setSending(false);
      if (!res.ok) {
        const msg = res.error === 'no_gmail_account' ? 'Connect Gmail in Settings first.'
          : res.error === 'token_refresh_failed' ? 'Gmail session expired. Reconnect in Settings.'
          : res.error === 'attachment_too_large' || res.error === 'attachments_too_large' ? 'Attachments are too large (max 3 MB).'
          : 'Could not send email. Try again.';
        toast(msg);
        return;
      }
      onClose();
      toast('Email sent & tracking ✓');
    }

    return React.createElement('div', { className: 'backdrop', onMouseDown: sending ? undefined : onClose },
      React.createElement('div', { className: 'modal wide', onMouseDown: e => e.stopPropagation() },
        React.createElement('div', { className: 'modal-head' }, React.createElement('h3', null, 'New Email'),
          React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose, disabled: sending }, React.createElement(Icon, { name: 'x', size: 16 }))),
        React.createElement('div', { className: 'modal-body', style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          React.createElement('div', { className: 'field', style: { position: 'relative' } }, React.createElement('label', { className: 'field-label' }, 'FROM'),
            React.createElement('button', { className: 'select', style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, onClick: () => !accountsLoading && setFromOpen(!fromOpen), disabled: accountsLoading || !accounts.length },
              React.createElement('span', null,
                accountsLoading ? 'Loading accounts…'
                  : accounts.length === 0 ? 'No Gmail connected'
                  : [React.createElement('span', { key: 'd', className: 'ac-dot', style: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--good)', marginRight: 8 } }), from, React.createElement('span', { key: 'k', className: 'muted', style: { marginLeft: 8, fontSize: 12 } }, '(Gmail)')]),
              React.createElement(Icon, { name: 'chevDown', size: 14 })),
            fromOpen && accounts.length > 0 && React.createElement('div', { className: 'card', style: { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 5, padding: 5, boxShadow: 'var(--shadow-md)' } },
              accounts.map((a) => React.createElement('button', { key: a.id, className: 'check-line', style: { width: '100%' }, onClick: () => { setFrom(a.email); setFromOpen(false); } },
                React.createElement('span', { className: 'ac-dot', style: { width: 7, height: 7, borderRadius: '50%', background: 'var(--good)' } }), a.email, React.createElement('span', { className: 'muted', style: { fontSize: 12 } }, '(Gmail)'))),
              React.createElement('div', { className: 'divider', style: { margin: '4px 0' } }),
              React.createElement('button', { className: 'check-line', style: { width: '100%', color: 'var(--accent)' }, onClick: () => { window.location.href = 'Peekd Dashboard.html?settings=integrations'; } }, React.createElement(Icon, { name: 'plus', size: 14 }), 'Connect another account')),
          ),
          React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'TO'),
            React.createElement('div', { className: 'pill-input' },
              to.map((em, i) => React.createElement('span', { key: i, className: 'email-pill' + (validEmail(em) ? '' : ' bad'), title: validEmail(em) ? '' : 'Invalid email' }, em,
                React.createElement('span', { className: 'pill-x', onClick: () => setTo(to.filter((_, j) => j !== i)) }, React.createElement(Icon, { name: 'x', size: 11 })))),
              React.createElement('input', { value: draft, placeholder: to.length ? '' : 'name@company.com', onChange: e => setDraft(e.target.value), onKeyDown: addEmail, disabled: sending })),
            bad && React.createElement('span', { style: { fontSize: 11.5, color: 'var(--danger)' } }, 'Enter a valid email address'),
          ),
          React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'SUBJECT'),
            React.createElement('input', { className: 'input', placeholder: 'Subject', value: subject, onChange: e => setSubject(e.target.value), disabled: sending })),
          React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'MESSAGE'),
            React.createElement(window.RichEditor, { value: body, onChange: setBody, minHeight: 200, placeholder: 'Write your message…' })),
          attachments.length > 0 && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            attachments.map((file) => React.createElement('div', { key: file.id, className: 'file-chip' },
              React.createElement('span', { className: 'fc-ico' }, React.createElement(Icon, { name: 'paperclip', size: 16 })),
              React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', { className: 'fc-name' }, file.name),
                React.createElement('div', { className: 'fc-size' }, fmtFileSize(file.size))),
              React.createElement('button', {
                className: 'row-act',
                onClick: () => removeAttachment(file.id),
                disabled: sending,
                title: 'Remove attachment',
              }, React.createElement(Icon, { name: 'x', size: 14 })),
            )),
          ),
        ),
        React.createElement('div', { className: 'modal-foot', style: { justifyContent: 'space-between' } },
          React.createElement('div', { className: 'flex center gap8' },
            React.createElement('input', {
              ref: fileRef,
              type: 'file',
              multiple: true,
              style: { display: 'none' },
              disabled: sending,
              onChange: (e) => addFiles(Array.from(e.target.files || [])),
            }),
            React.createElement('button', {
              className: 'btn btn-ghost btn-sm',
              onClick: () => fileRef.current && fileRef.current.click(),
              disabled: sending,
            }, React.createElement(Icon, { name: 'paperclip', size: 14 }), 'Attach'),
          ),
          React.createElement('div', { className: 'flex center gap12' },
            free && React.createElement('button', { className: 'upgrade-inline', style: { marginLeft: 0 }, onClick: onUpgrade }, 'Pro: remove branding ↗'),
            React.createElement('button', { className: 'btn btn-ghost', onClick: onClose, disabled: sending }, 'Cancel'),
            React.createElement('button', {
              className: 'btn btn-primary',
              onClick: handleSend,
              disabled: sending || !canSend || !accounts.length,
            }, sending ? 'Sending…' : 'Send & Track', !sending && React.createElement(Icon, { name: 'arrowRight', size: 15 })),
          ),
        ),
      ),
    );
  }

  function Upgrade({ onClose, onConfirm, toast }) {
    React.useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
    const feats = ['Campaigns & sequences', 'People Lists', 'Link click tracking', 'AI follow-up suggestions', 'Remove branding', 'Advanced analytics', 'Priority support'];
    return React.createElement('div', { className: 'backdrop', onMouseDown: onClose },
      React.createElement('div', { className: 'modal', style: { width: 'min(420px, calc(100vw - 40px))' }, onMouseDown: e => e.stopPropagation() },
        React.createElement('div', { className: 'modal-head' }, React.createElement('h3', null, 'Upgrade to Pro'),
          React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose }, React.createElement(Icon, { name: 'x', size: 16 }))),
        React.createElement('div', { className: 'modal-body' },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 } },
            React.createElement('span', { className: 'gate-ico', style: { width: 42, height: 42, margin: 0, borderRadius: 11, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff' } }, React.createElement(Icon, { name: 'bolt', size: 20, stroke: 2 })),
            React.createElement('div', null, React.createElement('div', { style: { fontWeight: 700, fontSize: 17 } }, 'Peekd Pro'), React.createElement('div', { className: 'muted', style: { fontSize: 13 } }, '$7 / month'))),
          React.createElement('div', { className: 'muted', style: { fontSize: 13, margin: '12px 0 6px' } }, 'Everything in Free, plus:'),
          feats.map((f, i) => React.createElement('div', { key: i, className: 'upgrade-feature' }, React.createElement(Icon, { name: 'check', size: 16 }), f)),
        ),
        React.createElement('div', { className: 'modal-foot', style: { flexDirection: 'column', gap: 8 } },
          React.createElement('button', { className: 'btn btn-upgrade', onClick: () => (onConfirm ? onConfirm() : (onClose(), toast('Welcome to Pro! 🎉'))) }, React.createElement(Icon, { name: 'bolt', size: 15, fill: 'currentColor', stroke: 0 }), 'Upgrade now — $7/mo'),
          React.createElement('button', { className: 'btn btn-ghost btn-block', onClick: onClose }, 'Maybe later'),
          React.createElement('div', { className: 'muted', style: { fontSize: 11.5, textAlign: 'center' } }, 'No contracts · cancel anytime'),
        ),
      ),
    );
  }

  function NotifDrawer({ onClose, notifs, setNotifs, onOpenEmail }) {
    const [tab, setTab] = useState('all');
    React.useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
    let list = notifs;
    if (tab === 'unread') list = notifs.filter(n => n.unread);
    else if (tab === 'opens') list = notifs.filter(n => n.type === 'open');
    else if (tab === 'replies') list = notifs.filter(n => n.type === 'reply');
    const initials = (name) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    return React.createElement('div', { className: 'drawer-wrap' },
      React.createElement('div', { className: 'drawer-bg', onClick: onClose }),
      React.createElement('div', { className: 'drawer' },
        React.createElement('div', { className: 'modal-head' },
          React.createElement('h3', null, 'Notifications'),
          React.createElement('div', { className: 'flex center gap12' },
            React.createElement('button', { className: 'banner-link', style: { marginLeft: 0 }, onClick: () => setNotifs(notifs.map(n => ({ ...n, unread: false }))) }, 'Mark all read'),
            React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose }, React.createElement(Icon, { name: 'x', size: 16 }))),
        ),
        React.createElement('div', { style: { padding: '12px 16px', borderBottom: '1px solid var(--line)' } },
          React.createElement('div', { className: 'tabs' },
            [['all', 'All'], ['unread', 'Unread'], ['opens', 'Opens'], ['replies', 'Replies']].map(([id, l]) =>
              React.createElement('button', { key: id, className: 'tab' + (tab === id ? ' active' : ''), onClick: () => setTab(id) }, l))),
        ),
        React.createElement('div', { style: { flex: 1, overflowY: 'auto' } },
          list.length === 0
            ? React.createElement('div', { style: { textAlign: 'center', color: 'var(--fg-mute)', padding: 40, fontSize: 13 } }, 'Nothing here yet')
            : list.map(n => React.createElement('button', {
                key: n.id, className: 'notif-row-d',
                onClick: () => { setNotifs(notifs.map(x => x.id === n.id ? { ...x, unread: false } : x)); onOpenEmail(); },
              },
                React.createElement('span', { className: 'timeline-ico ti-' + (n.type === 'reply' ? 'replied' : 'opened') }, React.createElement(Icon, { name: n.type === 'reply' ? 'cornerUpLeft' : 'eye', size: 15 })),
                React.createElement('div', { style: { flex: 1, minWidth: 0, textAlign: 'left' } },
                  React.createElement('div', { style: { fontSize: 13 } }, React.createElement('b', null, n.who + ' '), React.createElement('span', { className: 'dim' }, n.text)),
                  React.createElement('div', { className: 'muted', style: { fontSize: 11.5, marginTop: 2 } }, n.time)),
                n.unread && React.createElement('span', { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flex: '0 0 auto', alignSelf: 'center' } }),
              )),
        ),
      ),
    );
  }

  Object.assign(window, { Compose, Upgrade, NotifDrawer });
})();
