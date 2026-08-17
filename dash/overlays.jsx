// Peekd dashboard — shared overlays: Compose, Upgrade, Notifications drawer.
(function () {
  const { useState, useRef } = React;
  const Icon = window.Icon;
  const { Avatar } = window;
  const D = window.PeekdData;

  const MAX_FILE_BYTES = 3 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

  function providerLabel(account) {
    return account?.provider === 'outlook' ? '(Outlook)' : '(Gmail)';
  }

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

  function Compose({ free, onClose, onUpgrade, toast, initialBody, onSent, reply }) {
    const [to, setTo] = useState(reply?.to ? [reply.to] : []);
    const [draft, setDraft] = useState('');
    const [fromOpen, setFromOpen] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [from, setFrom] = useState('');
    const [subject, setSubject] = useState(reply?.subject || '');
    const [body, setBody] = useState(reply?.body || initialBody || '');
    const [attachments, setAttachments] = useState([]);
    const [sending, setSending] = useState(false);
    const [accountsLoading, setAccountsLoading] = useState(true);
    const fileRef = useRef(null);

    React.useEffect(() => { const k = e => e.key === 'Escape' && !sending && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [sending, onClose]);

    React.useEffect(() => {
      if (initialBody && !reply) setBody(initialBody);
    }, [initialBody]);

    React.useEffect(() => {
      let cancelled = false;
      (async () => {
        if (!window.PeekdIntegrations?.fetchSendingAccounts) {
          setAccountsLoading(false);
          return;
        }
        const res = await window.PeekdIntegrations.fetchSendingAccounts();
        if (cancelled) return;
        const list = res.ok ? (res.accounts || []) : [];
        setAccounts(list);
        // A reply must go out from the mailbox holding the thread, when it's still connected.
        const replyAccount = reply?.fromEmail && list.find((a) => a.email === reply.fromEmail);
        const primary = replyAccount || list.find((a) => a.is_primary) || list[0];
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

    // Thread ids and Message-IDs only resolve inside the mailbox they came from, so
    // switching the from-account turns the reply back into a plain new email.
    const threading = reply && from === reply.fromEmail ? reply : null;

    async function handleSend() {
      if (!canSend || sending || !window.PeekdGmail?.sendEmail) return;
      setSending(true);
      const res = await window.PeekdGmail.sendEmail({
        fromEmail: from,
        to: allTo,
        subject: subject.trim(),
        html: body,
        reply: threading && {
          threadId: threading.threadId,
          inReplyTo: threading.inReplyTo,
          references: threading.references,
          replyToMessageId: threading.replyToMessageId,
        },
        addBranding: free,
        trackLinks: !free,
        attachments: attachments.map((file) => ({
          filename: file.name,
          mimeType: file.mimeType,
          data: file.data,
        })),
      });
      setSending(false);
      if (!res.ok) {
        const msg = res.error === 'no_sending_account' || res.error === 'no_gmail_account' ? 'Connect an email account in Settings first.'
          : res.error === 'token_refresh_failed' ? 'Mailbox session expired. Reconnect in Settings.'
          : res.error === 'outlook_reconnect_required' ? 'Reconnect Outlook in Settings to grant send access.'
          : res.error === 'attachment_too_large' || res.error === 'attachments_too_large' ? 'Attachments are too large (max 3 MB).'
          : res.error ? `Could not send email (${res.error})`
          : 'Could not send email. Try again.';
        toast(msg);
        return;
      }
      if (window.PeekdPeople?.ensurePeopleFromEmails) {
        await window.PeekdPeople.ensurePeopleFromEmails(allTo);
      }
      toast('Message sent and being tracked');
      onSent?.();
      onClose();
    }

    return React.createElement('div', { className: 'backdrop', onMouseDown: sending ? undefined : onClose },
      React.createElement('div', { className: 'modal wide', onMouseDown: e => e.stopPropagation() },
        React.createElement('div', { className: 'modal-head' }, React.createElement('h3', null, reply ? 'Reply' : 'New Email'),
          React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose, disabled: sending }, React.createElement(Icon, { name: 'x', size: 16 }))),
        React.createElement('div', { className: 'modal-body', style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          React.createElement('div', { className: 'field', style: { position: 'relative' } }, React.createElement('label', { className: 'field-label' }, 'FROM'),
            React.createElement('button', { className: 'select', style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, onClick: () => !accountsLoading && setFromOpen(!fromOpen), disabled: accountsLoading || !accounts.length },
              React.createElement('span', null,
                accountsLoading ? 'Loading accounts…'
                  : accounts.length === 0 ? 'No email account connected'
                  : [React.createElement('span', { key: 'd', className: 'ac-dot', style: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--good)', marginRight: 8 } }), from, React.createElement('span', { key: 'k', className: 'muted', style: { marginLeft: 8, fontSize: 12 } }, providerLabel(accounts.find((a) => a.email === from)))]),
              React.createElement(Icon, { name: 'chevDown', size: 14 })),
            fromOpen && accounts.length > 0 && React.createElement('div', { className: 'card', style: { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 5, padding: 5, boxShadow: 'var(--shadow-md)' } },
              accounts.map((a) => React.createElement('button', { key: a.id, className: 'check-line', style: { width: '100%' }, onClick: () => { setFrom(a.email); setFromOpen(false); } },
                React.createElement('span', { className: 'ac-dot', style: { width: 7, height: 7, borderRadius: '50%', background: 'var(--good)' } }), a.email, React.createElement('span', { className: 'muted', style: { fontSize: 12 } }, providerLabel(a)))),
              React.createElement('div', { className: 'divider', style: { margin: '4px 0' } }),
              React.createElement('button', { className: 'check-line', style: { width: '100%', color: 'var(--accent)' }, onClick: () => { window.location.href = 'Peekd Dashboard.html?settings=integrations'; } }, React.createElement(Icon, { name: 'plus', size: 14 }), 'Connect another account')),
          ),
          reply && !threading && React.createElement('div', { className: 'muted', style: { fontSize: 12, marginTop: -6 } },
            `Sending from a different account, so this won't join the original thread with ${reply.fromEmail}.`),
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

  function Upgrade({ onClose, onConfirm, onRedeemCoupon, onStripe, toast, billing }) {
    const methods = billing || { coupons: true, paddle: true, stripe: false };
    const [busy, setBusy] = React.useState(false);
    const [stripeBusy, setStripeBusy] = React.useState(false);
    const [couponOpen, setCouponOpen] = React.useState(false);
    const [coupon, setCoupon] = React.useState('');
    const [couponBusy, setCouponBusy] = React.useState(false);
    const locked = busy || couponBusy || stripeBusy;
    const hasCheckout = !!(methods.paddle || methods.stripe);
    const hasAny = hasCheckout || !!methods.coupons;
    React.useEffect(() => { const k = e => e.key === 'Escape' && !locked && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [locked]);
    const feats = ['Campaigns & sequences', 'People Lists', 'Link click tracking', 'AI follow-up suggestions', 'Remove branding', 'Advanced analytics', 'Priority support'];
    async function handleUpgrade() {
      if (locked || !methods.paddle) return;
      setBusy(true);
      try {
        if (onConfirm) await onConfirm();
        else { onClose(); toast('Welcome to Pro! 🎉'); }
      } finally {
        setBusy(false);
      }
    }
    async function handleStripe() {
      if (locked || !methods.stripe) return;
      setStripeBusy(true);
      try {
        if (onStripe) await onStripe();
        else toast('Stripe checkout is not available yet');
      } finally {
        setStripeBusy(false);
      }
    }
    async function handleRedeem(e) {
      if (e) e.preventDefault();
      if (locked || !onRedeemCoupon) return;
      const code = coupon.trim();
      if (!code) {
        toast('Enter a coupon code');
        return;
      }
      setCouponBusy(true);
      try {
        await onRedeemCoupon(code);
      } finally {
        setCouponBusy(false);
      }
    }
    return React.createElement('div', { className: 'backdrop', onMouseDown: () => !locked && onClose() },
      React.createElement('div', { className: 'modal', style: { width: 'min(420px, calc(100vw - 40px))' }, onMouseDown: e => e.stopPropagation() },
        React.createElement('div', { className: 'modal-head' }, React.createElement('h3', null, 'Upgrade to Pro'),
          React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose, disabled: locked }, React.createElement(Icon, { name: 'x', size: 16 }))),
        React.createElement('div', { className: 'modal-body' },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 } },
            React.createElement('span', { className: 'gate-ico', style: { width: 42, height: 42, margin: 0, borderRadius: 11, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff' } }, React.createElement(Icon, { name: 'bolt', size: 20, stroke: 2 })),
            React.createElement('div', null, React.createElement('div', { style: { fontWeight: 700, fontSize: 17 } }, 'Peekd Pro'), React.createElement('div', { className: 'muted', style: { fontSize: 13 } }, '$7 / month'))),
          React.createElement('div', { className: 'muted', style: { fontSize: 13, margin: '12px 0 6px' } }, 'Everything in Free, plus:'),
          feats.map((f, i) => React.createElement('div', { key: i, className: 'upgrade-feature' }, React.createElement(Icon, { name: 'check', size: 16 }), f)),
        ),
        React.createElement('div', { className: 'modal-foot', style: { flexDirection: 'column', gap: 8 } },
          !hasAny && React.createElement('p', { className: 'muted', style: { fontSize: 13, textAlign: 'center', margin: '0 0 4px' } }, 'Purchases are paused right now. Contact support if you need Pro.'),
          methods.paddle && React.createElement('button', { className: 'btn btn-upgrade', onClick: handleUpgrade, disabled: locked }, React.createElement(Icon, { name: 'bolt', size: 15, fill: 'currentColor', stroke: 0 }), busy ? 'Opening checkout…' : 'Upgrade with Paddle — $7/mo'),
          methods.stripe && React.createElement('button', { className: 'btn btn-primary btn-block', onClick: handleStripe, disabled: locked }, stripeBusy ? 'Opening Stripe…' : 'Upgrade with Stripe — $7/mo'),
          methods.coupons && (couponOpen
            ? React.createElement('form', { onSubmit: handleRedeem, style: { display: 'flex', gap: 8, width: '100%' } },
                React.createElement('input', {
                  className: 'input',
                  value: coupon,
                  onChange: (e) => setCoupon(e.target.value),
                  placeholder: 'Coupon code',
                  autoFocus: true,
                  disabled: locked,
                  style: { flex: 1, minWidth: 0, textTransform: 'uppercase' },
                }),
                React.createElement('button', {
                  className: 'btn btn-primary',
                  type: 'submit',
                  disabled: locked || !coupon.trim(),
                  style: { width: 'auto', padding: '0 14px', flex: '0 0 auto' },
                }, couponBusy ? '…' : 'Redeem'))
            : React.createElement('button', {
              className: 'btn btn-ghost btn-block',
              onClick: () => setCouponOpen(true),
              disabled: locked,
            }, 'Have a coupon?')),
          React.createElement('button', { className: 'btn btn-ghost btn-block', onClick: onClose, disabled: locked }, 'Maybe later'),
          hasCheckout && React.createElement('div', { className: 'muted', style: { fontSize: 11.5, textAlign: 'center' } },
            methods.paddle && methods.stripe ? 'Secure checkout by Paddle or Stripe · cancel anytime'
              : methods.stripe ? 'Secure checkout by Stripe · cancel anytime'
                : 'Secure checkout by Paddle · cancel anytime'),
        ),
      ),
    );
  }

  function NotifDrawer({ onClose, notifs, loading, onMarkAllRead, onSelect }) {
    const [tab, setTab] = useState('all');
    React.useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
    let list = notifs;
    if (tab === 'opens') list = notifs.filter(n => n.type === 'open');
    else if (tab === 'clicks') list = notifs.filter(n => n.type === 'click');
    else if (tab === 'replies') list = notifs.filter(n => n.type === 'reply');

    function ico(type) {
      if (type === 'reply') return { ti: 'replied', name: 'cornerUpLeft' };
      if (type === 'click') return { ti: 'clicked', name: 'link' };
      return { ti: 'opened', name: 'eye' };
    }

    return React.createElement('div', { className: 'drawer-wrap' },
      React.createElement('div', { className: 'drawer-bg', onClick: onClose }),
      React.createElement('div', { className: 'drawer' },
        React.createElement('div', { className: 'modal-head' },
          React.createElement('h3', null, 'Notifications'),
          React.createElement('div', { className: 'flex center gap12' },
            React.createElement('button', { className: 'banner-link', style: { marginLeft: 0 }, onClick: onMarkAllRead }, 'Mark all read'),
            React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose }, React.createElement(Icon, { name: 'x', size: 16 }))),
        ),
        React.createElement('div', { style: { padding: '12px 16px', borderBottom: '1px solid var(--line)' } },
          React.createElement('div', { className: 'tabs' },
            [['all', 'All'], ['opens', 'Opens'], ['clicks', 'Clicks'], ['replies', 'Replies']].map(([id, l]) =>
              React.createElement('button', { key: id, className: 'tab' + (tab === id ? ' active' : ''), onClick: () => setTab(id) }, l))),
        ),
        React.createElement('div', { style: { flex: 1, overflowY: 'auto' } },
          loading && list.length === 0
            ? React.createElement('div', { style: { textAlign: 'center', color: 'var(--fg-mute)', padding: 40, fontSize: 13 } }, 'Loading…')
            : list.length === 0
            ? React.createElement('div', { style: { textAlign: 'center', color: 'var(--fg-mute)', padding: 40, fontSize: 13 } },
                tab === 'opens' ? 'No opens yet' : tab === 'clicks' ? 'No clicks yet' : tab === 'replies' ? 'No replies yet' : 'Nothing here yet')
            : list.map(n => {
                const icon = ico(n.type);
                return React.createElement('button', {
                  key: n.id, className: 'notif-row-d',
                  onClick: () => onSelect(n),
                },
                  React.createElement('span', { className: 'timeline-ico ti-' + icon.ti }, React.createElement(Icon, { name: icon.name, size: 15 })),
                  React.createElement('div', { style: { flex: 1, minWidth: 0, textAlign: 'left' } },
                    React.createElement('div', { style: { fontSize: 13 } }, React.createElement('b', null, n.who + ' '), React.createElement('span', { className: 'dim' }, n.text)),
                    React.createElement('div', { className: 'muted', style: { fontSize: 11.5, marginTop: 2 } }, n.time)),
                  n.unread && React.createElement('span', { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flex: '0 0 auto', alignSelf: 'center' } }),
                );
              }),
        ),
      ),
    );
  }

  Object.assign(window, { Compose, Upgrade, NotifDrawer });
})();
