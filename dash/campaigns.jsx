// Peekd dashboard — Campaigns page (list + Free gate + create modal).
(function () {
  const { useState, useEffect, useRef } = React;
  const Icon = window.Icon;
  const { Avatar } = window;
  const D = window.PeekdData;
  const Store = window.PeekdCampaigns;
  const Lists = window.PeekdLists;

  function CampaignsPage({ free, onUpgrade, toast, setHeaderExtra, setHeaderCTA, seed, clearSeed }) {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [launching, setLaunching] = useState(false);
    const [seedList, setSeedList] = useState(null);
    const [selId, setSelId] = useState(null);

    const refresh = React.useCallback(async () => {
      if (!Store?.fetchCampaigns) {
        setCampaigns([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await Store.fetchCampaigns();
      if (res.ok) setCampaigns(res.campaigns);
      else if (toast) toast(res.error || 'Could not load campaigns');
      setLoading(false);
    }, [toast]);

    useEffect(() => { refresh(); }, [refresh]);

    React.useEffect(() => {
      if (seed && !free) { setSeedList(seed); setCreating(true); clearSeed && clearSeed(); }
    }, [seed, free]);

    React.useEffect(() => {
      setHeaderExtra(null);
      if (!free && !selId) {
        setHeaderCTA(React.createElement('button', { className: 'btn btn-primary', onClick: () => setCreating(true) },
          React.createElement(Icon, { name: 'plus', size: 16 }), 'Create campaign'));
      } else {
        setHeaderCTA(null);
      }
      return () => setHeaderCTA(null);
    }, [free, selId]);

    const patchCampaign = (id, next) => {
      setCampaigns((prev) => prev.map((c) => (c.id === id ? (typeof next === 'function' ? next(c) : next) : c)));
    };

    const toggleStatus = async (id) => {
      const current = campaigns.find((c) => c.id === id);
      if (!current || !Store?.updateCampaignStatus) return;
      const nextStatus = current.status === 'PAUSED' ? 'active' : 'paused';
      const res = await Store.updateCampaignStatus(id, nextStatus);
      if (!res.ok) { toast(res.error || 'Could not update campaign'); return; }
      patchCampaign(id, res.campaign);
    };

    const removeCampaign = async (id) => {
      if (!Store?.deleteCampaign) return;
      const res = await Store.deleteCampaign(id);
      if (!res.ok) { toast(res.error || 'Could not delete campaign'); return; }
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      if (selId === id) setSelId(null);
      toast('Campaign deleted');
    };

    const rename = async (id, newName) => {
      if (!Store?.renameCampaign || !newName) return;
      const res = await Store.renameCampaign(id, newName);
      if (!res.ok) { toast(res.error || 'Could not rename campaign'); return; }
      patchCampaign(id, res.campaign);
    };

    const duplicate = async (id) => {
      if (!Store?.duplicateCampaign) return;
      const res = await Store.duplicateCampaign(id);
      if (!res.ok) { toast(res.error || 'Could not duplicate campaign'); return; }
      setCampaigns((prev) => [res.campaign, ...prev]);
      toast('Campaign duplicated ✓');
    };

    if (free) return React.createElement('div', { className: 'page-pad' },
      React.createElement('div', { className: 'gate' },
        React.createElement('div', { className: 'gate-ico' }, React.createElement(Icon, { name: 'lock', size: 28 })),
        React.createElement('h2', null, 'Campaigns · Pro Feature'),
        React.createElement('p', null, 'Create automated sequences and follow-ups that pause the moment a recipient replies. Reach more people without the manual work.'),
        React.createElement('button', { className: 'btn btn-upgrade', style: { width: 'auto', padding: '0 22px' }, onClick: onUpgrade },
          React.createElement(Icon, { name: 'bolt', size: 15, fill: 'currentColor', stroke: 0 }), 'Upgrade to Pro — $7/mo'),
      ),
    );

    const selected = campaigns.find(c => c.id === selId);
    if (selected) return React.createElement(CampaignDetail, {
      c: selected, onBack: () => setSelId(null), toast,
      onToggleStatus: () => toggleStatus(selected.id),
      onDelete: () => removeCampaign(selected.id),
      onRename: (newName) => rename(selected.id, newName),
      onDuplicate: () => duplicate(selected.id),
    });

    return React.createElement('div', { className: 'page-pad' },
      loading && React.createElement('div', { className: 'muted', style: { marginBottom: 12 } }, 'Loading campaigns…'),
      !loading && !campaigns.length && React.createElement('div', { className: 'card', style: { padding: 28, textAlign: 'center' } },
        React.createElement('h3', { style: { margin: '0 0 8px' } }, 'No campaigns yet'),
        React.createElement('p', { className: 'muted', style: { margin: '0 0 16px' } }, 'Create a sequence, pick recipients, and launch.'),
        React.createElement('button', { className: 'btn btn-primary', onClick: () => setCreating(true) },
          React.createElement(Icon, { name: 'plus', size: 16 }), 'Create campaign'),
      ),
      campaigns.map(c => React.createElement(CampaignCard, {
        key: c.id, c,
        onClick: () => setSelId(c.id),
        onToggleStatus: () => toggleStatus(c.id),
        onDelete: () => removeCampaign(c.id),
        onDuplicate: () => duplicate(c.id),
        onRename: (newName) => rename(c.id, newName),
        toast,
      })),
      creating && React.createElement(CreateCampaign, {
        initialListId: seedList ? seedList.id : null,
        launching,
        onClose: () => { if (!launching) { setCreating(false); setSeedList(null); } },
        onLaunch: async (payload) => {
          if (!Store?.createCampaign || launching) return;
          setLaunching(true);
          const res = await Store.createCampaign(payload);
          setLaunching(false);
          if (!res.ok) {
            toast(res.error === 'recipients_required' ? 'Add at least one recipient'
              : res.error === 'steps_required' ? 'Add at least one step'
                : (res.error || 'Could not launch campaign'));
            return;
          }
          setCampaigns((prev) => [res.campaign, ...prev]);
          setCreating(false);
          setSeedList(null);
          toast('Campaign launched ✓');
        },
      }),
    );
  }

  function CampaignCard({ c, onClick, onToggleStatus, onDelete, onDuplicate, onRename, toast }) {
    const [moreOpen, setMoreOpen] = useState(false);
    const [confirmDel, setConfirmDel] = useState(false);
    const [editing, setEditing] = useState(false);
    const moreRef = useRef(null);
    const paused = c.status === 'PAUSED';
    const pct = Math.round((c.step / Math.max(c.steps, 1)) * 100);
    const orClass = c.openRate > 50 ? 'stat-up' : c.openRate >= 20 ? 'stat-amber' : 'stat-down';
    useEffect(() => {
      if (!moreOpen) return;
      const h = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); };
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, [moreOpen]);
    const stop = (fn) => (e) => { e.stopPropagation(); fn && fn(); };

    return React.createElement('div', { className: 'card camp-card clickable' + (paused ? ' camp-paused' : ''), onClick },
      React.createElement('div', { className: 'camp-head' },
        React.createElement('div', { className: 'camp-name' }, c.name,
          React.createElement('span', { className: 'badge ' + (paused ? 'b-paused' : 'b-active') }, c.status)),
        React.createElement('div', { className: 'camp-actions', ref: moreRef },
          React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: stop(() => { onToggleStatus(); toast(paused ? 'Campaign resumed' : 'Campaign paused'); }) },
            React.createElement(Icon, { name: paused ? 'arrowRight' : 'clock', size: 14 }), paused ? 'Resume' : 'Pause'),
          React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: stop(() => setMoreOpen(!moreOpen)) },
            React.createElement(Icon, { name: 'dots', size: 15 }), 'More'),
          moreOpen && React.createElement('div', { className: 'more-menu', onClick: e => e.stopPropagation() },
            React.createElement('button', { onClick: () => { setMoreOpen(false); setEditing(true); } }, React.createElement(Icon, { name: 'edit', size: 14 }), 'Edit campaign'),
            React.createElement('button', { onClick: () => { setMoreOpen(false); onDuplicate(); } }, React.createElement(Icon, { name: 'grid', size: 14 }), 'Duplicate'),
            React.createElement('button', { onClick: () => { setMoreOpen(false); onToggleStatus(); toast(paused ? 'Campaign resumed' : 'Campaign paused'); } }, React.createElement(Icon, { name: paused ? 'arrowRight' : 'clock', size: 14 }), paused ? 'Resume' : 'Pause'),
            React.createElement('div', { className: 'divider', style: { margin: '4px 0' } }),
            React.createElement('button', { className: 'danger', onClick: () => { setMoreOpen(false); setConfirmDel(true); } }, React.createElement(Icon, { name: 'trash', size: 14 }), 'Delete campaign'),
          ),
        ),
      ),
      React.createElement('div', { className: 'camp-divider' }),
      React.createElement('div', { className: 'camp-stats' },
        React.createElement('div', { className: 'cm-cell' },
          React.createElement('div', { className: 'cm-label' }, 'PROGRESS'),
          React.createElement('div', { className: 'cm-step' }, 'Step ' + c.step + ' of ' + c.steps),
          React.createElement('div', { className: 'progress' + (paused ? ' blue' : '') }, React.createElement('span', { style: { width: pct + '%' } })),
        ),
        React.createElement('div', { className: 'cm-cell' }, React.createElement('div', { className: 'cm-label' }, 'RECIPIENTS'), React.createElement('div', { className: 'cm-value' }, c.recipients)),
        React.createElement('div', { className: 'cm-cell' }, React.createElement('div', { className: 'cm-label' }, 'OPEN RATE'), React.createElement('div', { className: 'cm-value ' + orClass }, c.openRate + '%')),
        React.createElement('div', { className: 'cm-cell' }, React.createElement('div', { className: 'cm-label' }, 'REPLIES'), React.createElement('div', { className: 'cm-value' }, c.replies)),
      ),
      React.createElement('div', { className: 'camp-created-row' }, React.createElement('span', { className: 'camp-created' }, 'Created ' + c.created)),

      confirmDel && React.createElement('div', { className: 'backdrop', onClick: stop(() => setConfirmDel(false)), onMouseDown: stop(() => setConfirmDel(false)) },
        React.createElement('div', { className: 'modal', style: { width: 'min(380px, calc(100vw - 40px))' }, onClick: e => e.stopPropagation(), onMouseDown: e => e.stopPropagation() },
          React.createElement('div', { className: 'modal-body', style: { textAlign: 'center', paddingTop: 26 } },
            React.createElement('h3', { style: { margin: '0 0 8px', fontSize: 17 } }, 'Delete ' + c.name + '?'),
            React.createElement('p', { className: 'muted', style: { fontSize: 13.5, margin: 0 } }, 'This cannot be undone.')),
          React.createElement('div', { className: 'modal-foot', style: { justifyContent: 'center' } },
            React.createElement('button', { className: 'btn btn-ghost', onClick: () => setConfirmDel(false) }, 'Cancel'),
            React.createElement('button', { className: 'btn', style: { background: 'var(--danger)', color: '#fff' }, onClick: () => { setConfirmDel(false); onDelete(); } }, 'Delete')),
        ),
      ),
      editing && React.createElement('div', { onClick: e => e.stopPropagation(), onMouseDown: e => e.stopPropagation() },
        React.createElement(EditCampaign, {
          c, steps: buildSteps(c), recipients: buildRecipients(c),
          onClose: () => setEditing(false),
          onSave: (newName) => { if (newName && newName !== c.name) onRename(newName); setEditing(false); toast('Campaign updated ✓'); },
        }),
      ),
    );
  }

  function StepInd({ step }) {
    return React.createElement('div', { className: 'steps-ind' },
      [1, 2, 3].map((n, i) => [
        React.createElement('span', { key: 'd' + n, className: 'step-dot' + (step === n ? ' active' : step > n ? ' done' : '') }, step > n ? React.createElement(Icon, { name: 'check', size: 12 }) : n),
        i < 2 && React.createElement('span', { key: 'l' + n, className: 'step-line' + (step > n ? ' done' : '') }),
      ]),
    );
  }

  // Shared recipient selector — "Add individually" pills OR "Use a saved list".
  function RecipientPicker({ mode, setMode, emails, setEmails, listId, setListId }) {
    const [lists, setLists] = useState([]);
    const [draft, setDraft] = useState('');
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const sel = lists.find(l => l.id === listId);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        if (!Lists?.fetchLists) return;
        const res = await Lists.fetchLists();
        if (!cancelled && res.ok) setLists(res.lists || []);
      })();
      return () => { cancelled = true; };
    }, []);

    const toIndividual = () => { setMode('individual'); setListId(null); };
    const toList = () => setMode('list');

    const addEmail = (raw) => {
      const email = String(raw || '').trim().toLowerCase();
      if (!email) return;
      if (Store?.isEmail && !Store.isEmail(email)) return;
      if (emails.includes(email)) { setDraft(''); return; }
      setEmails([...emails, email]);
      setDraft('');
    };

    const createList = async () => {
      const nm = newName.trim();
      if (!nm) { setCreating(false); return; }
      if (Lists?.createList) {
        const res = await Lists.createList(nm);
        if (res.ok) {
          setLists((prev) => [res.list, ...prev]);
          setListId(res.list.id);
          setNewName('');
          setCreating(false);
          return;
        }
      }
      setCreating(false);
    };

    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'tabs', style: { width: 'fit-content', marginBottom: 10 } },
        React.createElement('button', { className: 'tab' + (mode === 'individual' ? ' active' : ''), onClick: toIndividual }, 'Add individually'),
        React.createElement('button', { className: 'tab' + (mode === 'list' ? ' active' : ''), onClick: toList }, 'Use a saved list')),
      mode === 'individual'
        ? React.createElement('div', { className: 'pill-input' },
            emails.map((em, i) => React.createElement('span', { key: em, className: 'email-pill' }, em,
              React.createElement('span', { className: 'pill-x', onClick: () => setEmails(emails.filter((_, j) => j !== i)) }, React.createElement(Icon, { name: 'x', size: 11 })))),
            React.createElement('input', {
              placeholder: emails.length ? '' : 'Add email…',
              value: draft,
              onChange: (e) => setDraft(e.target.value),
              onKeyDown: (e) => {
                if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
                  e.preventDefault();
                  addEmail(draft.replace(/,/g, ''));
                }
              },
              onBlur: () => addEmail(draft),
            }))
        : React.createElement('div', null,
            React.createElement('div', { className: 'list-pick' },
              lists.map((l) => React.createElement('button', {
                key: l.id, type: 'button',
                className: 'list-pick-row' + (listId === l.id ? ' on' : ''),
                onClick: () => setListId(l.id),
              },
                React.createElement('span', { className: 'lp-radio' + (listId === l.id ? ' on' : '') }),
                React.createElement('span', { className: 'lp-name' }, l.name),
                React.createElement('span', { className: 'lp-count' }, (l.count || 0) + ' people'))),
              creating
                ? React.createElement('div', { className: 'lp-create-row' },
                    React.createElement('input', { className: 'input', autoFocus: true, placeholder: 'List name…', value: newName, onChange: e => setNewName(e.target.value), onKeyDown: e => { if (e.key === 'Enter') createList(); if (e.key === 'Escape') setCreating(false); } }),
                    React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: createList }, 'Create'))
                : React.createElement('button', { type: 'button', className: 'lp-create-link', onClick: () => setCreating(true) },
                    React.createElement(Icon, { name: 'plus', size: 13 }), 'Create new list')),
            sel
              ? React.createElement('div', { className: 'lp-summary' }, React.createElement(Icon, { name: 'check', size: 13 }), sel.name + ' selected · ' + (sel.count || 0) + ' recipients')
              : React.createElement('div', { className: 'lp-summary muted-summary' }, '0 recipients selected'),
          ),
    );
  }

  function CreateCampaign({ onClose, onLaunch, initialListId, launching }) {
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [seqSteps, setSeqSteps] = useState([{ subject: '', message: '', timing: 'now', days: 3 }]);
    const [rmode, setRmode] = useState(initialListId ? 'list' : 'individual');
    const [listId, setListId] = useState(initialListId || null);
    const [emails, setEmails] = useState([]);
    const [fromEmail, setFromEmail] = useState('');
    const [fromOpen, setFromOpen] = useState(false);
    const [accounts, setAccounts] = useState([]);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        const I = window.PeekdIntegrations;
        if (!I?.fetchGmailAccounts) return;
        const res = await I.fetchGmailAccounts();
        if (cancelled || !res.ok) return;
        const list = res.accounts || [];
        setAccounts(list);
        const primary = list.find((a) => a.is_primary) || list[0];
        if (primary?.email) setFromEmail(primary.email);
      })();
      return () => { cancelled = true; };
    }, []);

    const onKey = (e) => { if (e.key === 'Escape' && !launching) onClose(); };
    React.useEffect(() => { document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [launching]);

    const canNext = step !== 1 || (rmode === 'individual' ? emails.length > 0 : !!listId);

    const launch = () => {
      onLaunch({
        name: name || 'Untitled campaign',
        fromEmail,
        timezone: Store?.clientTimezone ? Store.clientTimezone() : undefined,
        sourceListId: rmode === 'list' ? listId : null,
        emails: rmode === 'individual' ? emails : [],
        steps: seqSteps,
      });
    };

    return React.createElement('div', { className: 'backdrop', onMouseDown: () => { if (!launching) onClose(); } },
      React.createElement('div', { className: 'modal wide', onMouseDown: e => e.stopPropagation() },
        React.createElement('div', { className: 'modal-head' },
          React.createElement('h3', null, 'New Campaign'),
          React.createElement('div', { className: 'flex center gap12' },
            React.createElement('span', { className: 'pill-tag' }, 'STEP ' + step + ' OF 3'),
            React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose, disabled: launching }, React.createElement(Icon, { name: 'x', size: 16 }))),
        ),
        React.createElement('div', { className: 'modal-body' },
          React.createElement(StepInd, { step }),
          step === 1 && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
            React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'CAMPAIGN NAME'),
              React.createElement('input', { className: 'input', placeholder: 'Q2 Outreach — Enterprise', value: name, onChange: e => setName(e.target.value) })),
            React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'FROM'),
              React.createElement('div', { style: { position: 'relative' } },
                React.createElement('button', {
                  type: 'button',
                  className: 'select',
                  style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
                  onClick: () => setFromOpen(!fromOpen),
                }, fromEmail || 'Connect a Gmail account', React.createElement(Icon, { name: 'chevDown', size: 14 })),
                fromOpen && React.createElement('div', { className: 'more-menu', style: { left: 0, right: 0, top: 'calc(100% + 4px)' } },
                  accounts.length
                    ? accounts.map((a) => React.createElement('button', {
                      key: a.id,
                      type: 'button',
                      onClick: () => { setFromEmail(a.email); setFromOpen(false); },
                    }, a.email + (a.is_primary ? ' · Primary' : '')))
                    : React.createElement('button', { type: 'button', disabled: true }, 'No connected accounts'),
                ),
              )),
            React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'RECIPIENTS'),
              React.createElement(RecipientPicker, { mode: rmode, setMode: setRmode, emails, setEmails, listId, setListId }),
            ),
          ),
          step === 2 && React.createElement('div', null,
            React.createElement('h4', { style: { margin: '0 0 14px', fontSize: 15 } }, 'Build Your Sequence'),
            seqSteps.map((s, i) => React.createElement('div', { key: i, className: 'seq-step' },
              React.createElement('h4', null, 'Step ' + (i + 1)),
              React.createElement('input', { className: 'input', placeholder: 'Subject', style: { marginBottom: 8 }, value: s.subject, onChange: e => { const n = [...seqSteps]; n[i] = { ...n[i], subject: e.target.value }; setSeqSteps(n); } }),
              React.createElement('div', { style: { marginBottom: 10 } }, React.createElement(window.RichEditor, { value: s.message || '', onChange: v => { const n = [...seqSteps]; n[i] = { ...n[i], message: v }; setSeqSteps(n); }, minHeight: 120, mergeTags: true, placeholder: 'Message…' })),
              React.createElement('div', { className: 'flex gap12' },
                React.createElement('label', { className: 'radio-line', onClick: () => { const n = [...seqSteps]; n[i] = { ...n[i], timing: 'now' }; setSeqSteps(n); } },
                  React.createElement('span', { className: 'radio-dot' + (s.timing === 'now' ? ' on' : '') }), 'Immediately'),
                React.createElement('label', { className: 'radio-line', onClick: () => { const n = [...seqSteps]; n[i] = { ...n[i], timing: 'wait' }; setSeqSteps(n); } },
                  React.createElement('span', { className: 'radio-dot' + (s.timing === 'wait' ? ' on' : '') }), 'Wait ', React.createElement('input', { className: 'input', style: { width: 48, height: 28, padding: '0 8px' }, value: s.days, onChange: e => { const n = [...seqSteps]; n[i] = { ...n[i], days: e.target.value }; setSeqSteps(n); } }), ' days'),
              ),
            )),
            seqSteps.length < 5 && React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => setSeqSteps([...seqSteps, { subject: '', message: '', timing: 'now', days: 3 }]) },
              React.createElement(Icon, { name: 'plus', size: 14 }), 'Add step'),
            React.createElement('p', { className: 'muted', style: { fontSize: 12.5, marginTop: 14 } }, 'Sequence pauses automatically when a recipient replies.'),
          ),
          step === 3 && React.createElement('div', null,
            React.createElement('h4', { style: { margin: '0 0 14px', fontSize: 15 } }, 'Review & Launch'),
            React.createElement('div', { className: 'seq-step' },
              React.createElement('div', { className: 'flex between', style: { marginBottom: 8 } }, React.createElement('span', { className: 'muted' }, 'Campaign'), React.createElement('b', null, name || 'Untitled campaign')),
              React.createElement('div', { className: 'flex between', style: { marginBottom: 8 } }, React.createElement('span', { className: 'muted' }, 'From'), React.createElement('b', null, fromEmail || '—')),
              React.createElement('div', { className: 'flex between', style: { marginBottom: 8 } }, React.createElement('span', { className: 'muted' }, 'Recipients'), React.createElement('b', null, rmode === 'individual' ? emails.length : 'List selected')),
              React.createElement('div', { className: 'flex between', style: { marginBottom: 8 } }, React.createElement('span', { className: 'muted' }, 'Steps'), React.createElement('b', null, seqSteps.length)),
              React.createElement('div', { className: 'flex between' }, React.createElement('span', { className: 'muted' }, 'Timezone'), React.createElement('b', null, Store?.clientTimezone ? Store.clientTimezone() : '—')),
            ),
          ),
        ),
        React.createElement('div', { className: 'modal-foot' },
          step > 1 && React.createElement('button', { className: 'btn btn-ghost', disabled: launching, onClick: () => setStep(step - 1) }, React.createElement(Icon, { name: 'chevLeft', size: 15 }), 'Back'),
          step < 3
            ? React.createElement('button', { className: 'btn btn-primary', disabled: !canNext, onClick: () => setStep(step + 1) }, 'Next', React.createElement(Icon, { name: 'arrowRight', size: 15 }))
            : React.createElement('button', { className: 'btn btn-primary', disabled: launching || !fromEmail, onClick: launch }, launching ? 'Launching…' : 'Launch Campaign'),
        ),
      ),
    );
  }

  // ── Campaign detail view ──────────────────────────────────
  const STEP_SUBJECTS = ['Introduction to Peekd', 'Quick follow-up', 'Last check-in', 'Closing the loop', 'Final note'];
  const STEP_WAITS = [3, 5, 7, 4];

  function formatStepSentLabel(step) {
    if (step.sentAt) {
      const d = new Date(step.sentAt);
      if (!Number.isNaN(d.getTime())) {
        return 'Sent ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    }
    if (step.scheduledAt && (step.status === 'scheduled' || step.status === 'pending')) {
      const d = new Date(step.scheduledAt);
      if (!Number.isNaN(d.getTime())) {
        return 'Scheduled · ' + d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      }
    }
    if (step.state === 'pending') return 'Scheduled · not sent yet';
    return 'Pending';
  }

  function buildSteps(c) {
    if (Array.isArray(c.stepRows) && c.stepRows.length) {
      return c.stepRows.map((s) => ({
        n: s.n,
        state: s.state,
        subject: s.subject || ('Step ' + s.n),
        wait: s.wait,
        openRate: null,
        replies: null,
        sentLabel: formatStepSentLabel(s),
        bodyHtml: s.bodyHtml || '',
      }));
    }
    const out = [];
    for (let i = 1; i <= c.steps; i++) {
      let state = i < c.step ? 'completed' : i === c.step ? (c.status === 'PAUSED' ? 'paused' : 'active') : 'pending';
      out.push({
        n: i, state,
        subject: STEP_SUBJECTS[i - 1] || 'Step ' + i,
        wait: i === 1 ? null : STEP_WAITS[i - 2],
        openRate: state === 'pending' ? null : Math.max(8, c.openRate + (i === 1 ? 4 : -2 * (i - 1)) + (c.step === i ? 0 : 0)),
        replies: state === 'pending' ? null : Math.max(0, Math.round(c.replies / c.steps) + (i === 1 ? 1 : 0)),
        sentLabel: state === 'completed' ? 'Sent ' + (c.steps - i + 2) + ' days ago' : state === 'pending' ? 'Scheduled · not sent yet' : 'Sent 2 days ago',
      });
    }
    return out;
  }

  function initialsFromEmail(email) {
    const local = String(email || '').split('@')[0] || '';
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase() || '?';
  }

  function nameFromEmail(email) {
    const local = String(email || '').split('@')[0] || 'Recipient';
    return local.split(/[._-]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || local;
  }

  function buildRecipients(c) {
    if (Array.isArray(c.recipientRows) && c.recipientRows.length) {
      return c.recipientRows.map((r) => {
        const status = r.status === 'REPLIED' ? 'REPLIED'
          : r.status === 'COMPLETED' ? 'OPENED'
            : r.status === 'PAUSED' ? 'PENDING'
              : 'PENDING';
        return {
          p: {
            initials: initialsFromEmail(r.email),
            name: nameFromEmail(r.email),
            email: r.email,
            sent: c.step || 1,
          },
          status,
          step: c.step || 1,
          rate: 0,
        };
      });
    }
    const p = D.people;
    return [
      { p: p[0], status: 'REPLIED', step: 2, rate: 83 },
      { p: p[1], status: 'OPENED', step: 2, rate: 14 },
      { p: p[2], status: 'REPLIED', step: 1, rate: 75 },
      { p: p[3], status: 'PENDING', step: 3, rate: 44 },
      { p: p[4], status: 'NO OPENS', step: 2, rate: 0 },
    ];
  }

  const RSTATUS = { REPLIED: 'b-replied', OPENED: 'b-opened', PENDING: 'b-sent', 'NO OPENS': 'b-unresp' };

  function CampaignDetail({ c, onBack, onToggleStatus, onDelete, onRename, onDuplicate, toast }) {
    const [moreOpen, setMoreOpen] = useState(false);
    const [confirmDel, setConfirmDel] = useState(false);
    const [editing, setEditing] = useState(false);
    const [rTab, setRTab] = useState('All');
    const [person, setPerson] = useState(null);
    const paused = c.status === 'PAUSED';
    const steps = buildSteps(c);
    const recipients = buildRecipients(c);
    const pct = Math.round((c.step / Math.max(c.steps, 1)) * 100);
    const filtered = recipients.filter(r => {
      if (rTab === 'All') return true;
      if (rTab === 'Opened') return r.status === 'OPENED';
      if (rTab === 'Replied') return r.status === 'REPLIED';
      if (rTab === 'Pending') return r.status === 'PENDING';
      if (rTab === 'Unsubscribed') return false;
      return true;
    });

    return React.createElement('div', { className: 'page-pad' },
      React.createElement('button', { className: 'back-link', onClick: onBack },
        React.createElement(Icon, { name: 'chevLeft', size: 16 }), 'Back to Campaigns'),

      React.createElement('div', { className: 'cd-head' },
        React.createElement('div', null,
          React.createElement('div', { className: 'cd-title' }, c.name,
            React.createElement('span', { className: 'badge ' + (paused ? 'b-paused' : 'b-active') }, c.status)),
          React.createElement('div', { className: 'cd-sub' }, 'Created ' + c.created + ' · ' + c.recipients + ' recipients'),
        ),
        React.createElement('div', { className: 'flex gap8', style: { position: 'relative' } },
          React.createElement('button', { className: 'btn btn-ghost', onClick: () => { onToggleStatus(); toast(paused ? 'Campaign resumed' : 'Campaign paused'); } },
            React.createElement(Icon, { name: paused ? 'arrowRight' : 'clock', size: 15 }), paused ? 'Resume' : 'Pause'),
          React.createElement('button', { className: 'btn btn-ghost', onClick: () => setMoreOpen(!moreOpen) }, React.createElement(Icon, { name: 'dots', size: 16 }), 'More'),
          moreOpen && React.createElement('div', { className: 'more-menu' },
            React.createElement('button', { onClick: () => { setMoreOpen(false); setEditing(true); } }, React.createElement(Icon, { name: 'edit', size: 14 }), 'Edit campaign'),
            React.createElement('button', { onClick: () => { setMoreOpen(false); onDuplicate && onDuplicate(); } }, React.createElement(Icon, { name: 'grid', size: 14 }), 'Duplicate'),
            React.createElement('button', { onClick: () => { setMoreOpen(false); onToggleStatus(); toast(paused ? 'Campaign resumed' : 'Campaign paused'); } }, React.createElement(Icon, { name: paused ? 'arrowRight' : 'clock', size: 14 }), paused ? 'Resume' : 'Pause'),
            React.createElement('div', { className: 'divider', style: { margin: '4px 0' } }),
            React.createElement('button', { className: 'danger', onClick: () => { setMoreOpen(false); setConfirmDel(true); } }, React.createElement(Icon, { name: 'trash', size: 14 }), 'Delete campaign'),
          ),
        ),
      ),

      React.createElement('div', { className: 'stat-grid' + (paused ? ' muted-stats' : ''), style: { marginBottom: 24 } },
        React.createElement('div', { className: 'card stat-card' }, React.createElement('div', { className: 'sc-label' }, 'RECIPIENTS'), React.createElement('div', { className: 'sc-value' }, c.recipients)),
        React.createElement('div', { className: 'card stat-card' }, React.createElement('div', { className: 'sc-label' }, 'OPEN RATE'), React.createElement('div', { className: 'sc-value ' + (paused ? '' : 'stat-up') }, c.openRate + '%')),
        React.createElement('div', { className: 'card stat-card' }, React.createElement('div', { className: 'sc-label' }, 'REPLIES'), React.createElement('div', { className: 'sc-value' }, c.replies)),
        React.createElement('div', { className: 'card stat-card' },
          React.createElement('div', { className: 'sc-label' }, 'PROGRESS'),
          React.createElement('div', { className: 'cm-step', style: { margin: '8px 0 8px' } }, 'Step ' + c.step + ' of ' + c.steps),
          React.createElement('div', { className: 'progress' + (paused ? ' blue' : '') }, React.createElement('span', { style: { width: pct + '%' } })),
        ),
      ),

      React.createElement('div', { className: 'cd-section-title' }, 'SEQUENCE STEPS'),
      React.createElement('div', { className: 'seq-timeline' },
        steps.map((s, i) => React.createElement('div', { key: i },
          s.wait != null && React.createElement('div', { className: 'seq-wait' }, React.createElement(Icon, { name: 'chevDown', size: 14 }), 'Wait ' + s.wait + ' days'),
          React.createElement('div', { className: 'seq-card seq-' + s.state },
            React.createElement('div', { className: 'seq-card-head' },
              React.createElement('span', { className: 'seq-ico' },
                s.state === 'completed' ? React.createElement(Icon, { name: 'checkCircle', size: 16 })
                  : s.state === 'pending' ? React.createElement(Icon, { name: 'clock', size: 16 })
                  : s.state === 'paused' ? React.createElement(Icon, { name: 'clock', size: 16 })
                  : React.createElement('span', { className: 'live-dot' })),
              React.createElement('span', { className: 'seq-step-name' }, 'Step ' + s.n),
              React.createElement('span', { className: 'seq-state-tag ' + s.state },
                s.state === 'completed' ? 'Completed' : s.state === 'active' ? 'Active (current)' : s.state === 'paused' ? '⏸ Paused' : 'Pending'),
            ),
            React.createElement('div', { className: 'seq-subject' }, 'Subject: "' + s.subject + '"'),
            React.createElement('div', { className: 'seq-meta' },
              s.state === 'pending'
                ? React.createElement('span', null, 'Scheduled · not sent yet')
                : React.createElement('span', null, s.sentLabel + ' · Open rate: ' + s.openRate + '% · Replies: ' + s.replies)),
          ),
        )),
      ),

      React.createElement('div', { className: 'flex between center', style: { margin: '28px 0 14px' } },
        React.createElement('div', { className: 'cd-section-title', style: { margin: 0 } }, 'RECIPIENTS'),
        React.createElement('div', { className: 'search-input', style: { width: 220 } }, React.createElement(Icon, { name: 'search', size: 15 }), React.createElement('input', { placeholder: 'Search recipients...' })),
      ),
      React.createElement('div', { className: 'tabs', style: { width: 'fit-content', marginBottom: 14 } },
        ['All', 'Opened', 'Replied', 'Pending', 'Unsubscribed'].map(t =>
          React.createElement('button', { key: t, className: 'tab' + (rTab === t ? ' active' : ''), onClick: () => setRTab(t) }, t)),
      ),
      React.createElement('div', { className: 'card', style: { overflow: 'hidden' } },
        React.createElement('table', { className: 'ptable' },
          React.createElement('thead', null, React.createElement('tr', null,
            ['NAME', 'EMAIL', 'STATUS', 'STEP', 'OPEN RATE'].map((h, i) => React.createElement('th', { key: i }, h)))),
          React.createElement('tbody', null,
            filtered.length === 0
              ? React.createElement('tr', null, React.createElement('td', { colSpan: 5, className: 'muted', style: { textAlign: 'center', padding: 28 } }, 'No recipients in this filter'))
              : filtered.map((r, i) => React.createElement('tr', { key: i, className: 'clickable', onClick: () => setPerson(r) },
                  React.createElement('td', { className: 'pcell-primary' }, React.createElement('div', { className: 'pcell-name' }, React.createElement(Avatar, { initials: r.p.initials, size: 32 }), React.createElement('span', { className: 'pn-main' }, r.p.name))),
                  React.createElement('td', { className: 'muted', 'data-label': 'Email' }, r.p.email),
                  React.createElement('td', { className: 'pcell-meta', 'data-label': 'Status' }, React.createElement('span', { className: 'badge ' + RSTATUS[r.status] }, r.status)),
                  React.createElement('td', { className: 'muted', 'data-label': 'Step' }, 'Step ' + r.step),
                  React.createElement('td', { className: 'pcell-meta', 'data-label': 'Open rate' }, r.rate + '%'),
                )),
          ),
        ),
      ),
      c.recipients > recipients.length && React.createElement('button', { className: 'btn btn-ghost btn-sm', style: { marginTop: 12 }, onClick: () => toast('Loading all recipients…') }, 'Show all ' + c.recipients + ' →'),

      React.createElement('div', { className: 'cd-section-title', style: { marginTop: 28 } }, 'ENGAGEMENT OVER TIME'),
      React.createElement('div', { className: 'card chart-card' },
        React.createElement('h3', null, 'Daily opens across all steps'),
        React.createElement('div', { className: 'cc-sub' }, 'Since ' + c.created),
        React.createElement(window.Chart, { data: D.openSeries, height: 200, axis: true, fmt: v => v + ' opens' }),
      ),

      confirmDel && React.createElement('div', { className: 'backdrop', onMouseDown: () => setConfirmDel(false) },
        React.createElement('div', { className: 'modal', style: { width: 'min(400px,calc(100vw - 40px))' }, onMouseDown: e => e.stopPropagation() },
          React.createElement('div', { className: 'modal-head' }, React.createElement('h3', null, 'Delete campaign?'),
            React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: () => setConfirmDel(false) }, React.createElement(Icon, { name: 'x', size: 16 }))),
          React.createElement('div', { className: 'modal-body' }, React.createElement('p', { className: 'dim', style: { margin: 0, lineHeight: 1.6 } }, 'Delete ', React.createElement('b', null, c.name), '? This cannot be undone.')),
          React.createElement('div', { className: 'modal-foot' },
            React.createElement('button', { className: 'btn btn-ghost', onClick: () => setConfirmDel(false) }, 'Cancel'),
            React.createElement('button', { className: 'btn btn-danger', onClick: onDelete }, 'Delete'),
          ),
        ),
      ),

      person && React.createElement(PersonDrawer, { r: person, onClose: () => setPerson(null) }),

      editing && React.createElement(EditCampaign, {
        c, steps, recipients,
        onClose: () => setEditing(false),
        onSave: (newName) => { if (newName && newName !== c.name) onRename(newName); setEditing(false); toast('Campaign updated ✓'); },
      }),
    );
  }

  function EditCampaign({ c, steps, recipients, onClose, onSave }) {
    const [name, setName] = useState(c.name);
    const [emails, setEmails] = useState(recipients.map(r => r.p?.email).filter(Boolean));
    const [rmode, setRmode] = useState(c.sourceListId ? 'list' : 'individual');
    const [listId, setListId] = useState(c.sourceListId || null);
    const [seqSteps, setSeqSteps] = useState(steps.map(s => ({
      subject: s.subject,
      message: s.bodyHtml || ('Hi there — following up on ' + String(s.subject || '').toLowerCase() + '. Let me know your thoughts.'),
      timing: s.wait == null ? 'now' : 'wait',
      days: s.wait == null ? 3 : s.wait,
    })));
    React.useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
    const upd = (i, key, val) => { const n = seqSteps.map((s, j) => j === i ? { ...s, [key]: val } : s); setSeqSteps(n); };

    return React.createElement('div', { className: 'backdrop', onMouseDown: onClose },
      React.createElement('div', { className: 'modal wide', onMouseDown: e => e.stopPropagation() },
        React.createElement('div', { className: 'modal-head' },
          React.createElement('h3', null, 'Edit Campaign'),
          React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose }, React.createElement(Icon, { name: 'x', size: 16 })),
        ),
        React.createElement('div', { className: 'modal-body' },
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
            React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'CAMPAIGN NAME'),
              React.createElement('input', { className: 'input', value: name, onChange: e => setName(e.target.value) })),
            React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'FROM'),
              React.createElement('button', { className: 'select', style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, c.fromEmail || '—', React.createElement(Icon, { name: 'chevDown', size: 14 }))),
            React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'RECIPIENTS'),
              React.createElement(RecipientPicker, { mode: rmode, setMode: setRmode, emails, setEmails, listId, setListId }),
            ),
          ),
          React.createElement('div', { className: 'divider', style: { margin: '18px 0' } }),
          React.createElement('h4', { style: { margin: '0 0 14px', fontSize: 15 } }, 'SEQUENCE STEPS'),
          seqSteps.map((s, i) => React.createElement('div', { key: i, className: 'seq-step' },
            React.createElement('div', { className: 'flex between center', style: { marginBottom: 10 } },
              React.createElement('h4', { style: { margin: 0 } }, 'Step ' + (i + 1)),
              seqSteps.length > 1 && React.createElement('button', { className: 'row-act', onClick: () => setSeqSteps(seqSteps.filter((_, j) => j !== i)) }, React.createElement(Icon, { name: 'trash', size: 14 }))),
            React.createElement('input', { className: 'input', placeholder: 'Subject', style: { marginBottom: 8 }, value: s.subject, onChange: e => upd(i, 'subject', e.target.value) }),
            React.createElement('div', { style: { marginBottom: 10 } }, React.createElement(window.RichEditor, { value: s.message || '', onChange: v => upd(i, 'message', v), minHeight: 120, mergeTags: true, placeholder: 'Message…' })),
            React.createElement('div', { className: 'flex gap12' },
              React.createElement('label', { className: 'radio-line', onClick: () => upd(i, 'timing', 'now') },
                React.createElement('span', { className: 'radio-dot' + (s.timing === 'now' ? ' on' : '') }), 'Immediately'),
              React.createElement('label', { className: 'radio-line', onClick: () => upd(i, 'timing', 'wait') },
                React.createElement('span', { className: 'radio-dot' + (s.timing === 'wait' ? ' on' : '') }), 'Wait ',
                React.createElement('input', { className: 'input', style: { width: 48, height: 28, padding: '0 8px' }, value: s.days, onChange: e => upd(i, 'days', e.target.value) }), ' days'),
            ),
          )),
          seqSteps.length < 5 && React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => setSeqSteps([...seqSteps, { subject: '', message: '', timing: 'wait', days: 3 }]) },
            React.createElement(Icon, { name: 'plus', size: 14 }), 'Add step'),
        ),
        React.createElement('div', { className: 'modal-foot' },
          React.createElement('button', { className: 'btn btn-ghost', onClick: onClose }, 'Cancel'),
          React.createElement('button', { className: 'btn btn-primary', onClick: () => onSave(name.trim()) }, 'Save changes'),
        ),
      ),
    );
  }

  function PersonDrawer({ r, onClose }) {
    React.useEffect(() => { const k = e => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
    return React.createElement('div', { className: 'drawer-wrap' },
      React.createElement('div', { className: 'drawer-bg', onClick: onClose }),
      React.createElement('div', { className: 'drawer' },
        React.createElement('div', { className: 'modal-head' }, React.createElement('h3', null, 'Recipient'),
          React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose }, React.createElement(Icon, { name: 'x', size: 16 }))),
        React.createElement('div', { style: { padding: 20, overflowY: 'auto' } },
          React.createElement('div', { className: 'flex center gap12', style: { marginBottom: 18 } },
            React.createElement(Avatar, { initials: r.p.initials, size: 48, fontSize: 17 }),
            React.createElement('div', null, React.createElement('div', { style: { fontWeight: 600, fontSize: 16 } }, r.p.name), React.createElement('div', { className: 'muted', style: { fontSize: 13 } }, r.p.email))),
          React.createElement('div', { className: 'engage-grid', style: { marginBottom: 18 } },
            React.createElement('div', { className: 'engage-cell' }, React.createElement('div', { className: 'ec-label' }, 'STATUS'), React.createElement('div', { className: 'ec-value', style: { fontSize: 14 } }, r.status)),
            React.createElement('div', { className: 'engage-cell' }, React.createElement('div', { className: 'ec-label' }, 'CURRENT STEP'), React.createElement('div', { className: 'ec-value', style: { fontSize: 14 } }, 'Step ' + r.step)),
            React.createElement('div', { className: 'engage-cell' }, React.createElement('div', { className: 'ec-label' }, 'OPEN RATE'), React.createElement('div', { className: 'ec-value', style: { fontSize: 14 } }, r.rate + '%')),
            React.createElement('div', { className: 'engage-cell' }, React.createElement('div', { className: 'ec-label' }, 'SENT'), React.createElement('div', { className: 'ec-value', style: { fontSize: 14 } }, r.p.sent)),
          ),
          React.createElement('div', { className: 'd-section-title' }, 'RECENT ACTIVITY'),
          React.createElement('div', { className: 'timeline' },
            [{ t: 'opened', l: 'opened Step ' + r.step, m: 'iPhone · 2h ago' }, { t: 'delivered', l: 'delivered', m: 'Step ' + r.step }, { t: 'sent', l: 'sent', m: 'Step ' + r.step }].map((e, i) =>
              React.createElement('div', { key: i, className: 'tl-event' },
                React.createElement('span', { className: 'timeline-ico ti-' + e.t }, React.createElement(Icon, { name: e.t === 'opened' ? 'eye' : e.t === 'delivered' ? 'check' : 'send', size: 15 })),
                React.createElement('div', { className: 'tl-body' }, React.createElement('div', { className: 'tl-line' }, React.createElement('span', { className: 'tl-text' }, React.createElement('b', null, r.p.name + ' '), e.l)), React.createElement('div', { className: 'tl-meta' }, e.m)))),
          ),
        ),
      ),
    );
  }

  window.CampaignsPage = CampaignsPage;
})();
