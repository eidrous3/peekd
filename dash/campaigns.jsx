// Peekd dashboard — Campaigns page (list + Free gate + create modal).
(function () {
  const { useState, useEffect, useRef } = React;
  const Icon = window.Icon;
  const D = window.PeekdData;

  function CampaignsPage({ free, onUpgrade, toast, setHeaderExtra, setHeaderCTA, seed, clearSeed }) {
    const [campaigns, setCampaigns] = useState(D.campaigns);
    const [creating, setCreating] = useState(false);
    const [seedList, setSeedList] = useState(null);
    const [selId, setSelId] = useState(null);

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
      onToggleStatus: () => setCampaigns(campaigns.map(c => c.id === selId ? { ...c, status: c.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED' } : c)),
      onDelete: () => { setCampaigns(campaigns.filter(c => c.id !== selId)); setSelId(null); toast('Campaign deleted'); },
      onRename: (newName) => setCampaigns(campaigns.map(c => c.id === selId ? { ...c, name: newName } : c)),
    });

    return React.createElement('div', { className: 'page-pad' },
      campaigns.map(c => React.createElement(CampaignCard, {
        key: c.id, c,
        onClick: () => setSelId(c.id),
        onToggleStatus: () => setCampaigns(campaigns.map(x => x.id === c.id ? { ...x, status: x.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED' } : x)),
        onDelete: () => { setCampaigns(campaigns.filter(x => x.id !== c.id)); toast('Campaign deleted'); },
        onDuplicate: () => { setCampaigns([{ ...c, id: 'c' + Date.now(), name: c.name + ' (copy)', created: 'Today' }, ...campaigns]); toast('Campaign duplicated ✓'); },
        onRename: (newName) => setCampaigns(campaigns.map(x => x.id === c.id ? { ...x, name: newName } : x)),
        toast,
      })),
      creating && React.createElement(CreateCampaign, {
        initialListId: seedList ? seedList.id : null,
        onClose: () => { setCreating(false); setSeedList(null); },
        onLaunch: (name) => {
          setCampaigns([{ id: 'c' + Date.now(), name: name || 'Untitled campaign', status: 'ACTIVE', created: 'Today', step: 1, steps: 3, recipients: 0, openRate: 0, replies: 0 }, ...campaigns]);
          setCreating(false); setSeedList(null); toast('Campaign launched ✓');
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
    const pct = Math.round((c.step / c.steps) * 100);
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
          c, steps: buildSteps(c), recipients: buildRecipients(),
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
    const [extra, setExtra] = useState([]);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const lists = D.lists.concat(extra);
    const sel = lists.find(l => l.id === listId);
    const toIndividual = () => { setMode('individual'); setListId(null); setEmails([]); };
    const toList = () => setMode('list');
    const createList = () => {
      const nm = newName.trim();
      if (!nm) { setCreating(false); return; }
      const id = 'l' + Date.now();
      setExtra([...extra, { id, name: nm, count: 0 }]);
      setListId(id); setNewName(''); setCreating(false);
    };
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'tabs', style: { width: 'fit-content', marginBottom: 10 } },
        React.createElement('button', { className: 'tab' + (mode === 'individual' ? ' active' : ''), onClick: toIndividual }, 'Add individually'),
        React.createElement('button', { className: 'tab' + (mode === 'list' ? ' active' : ''), onClick: toList }, 'Use a saved list')),
      mode === 'individual'
        ? React.createElement('div', { className: 'pill-input' },
            emails.map((em, i) => React.createElement('span', { key: i, className: 'email-pill' }, em,
              React.createElement('span', { className: 'pill-x', onClick: () => setEmails(emails.filter((_, j) => j !== i)) }, React.createElement(Icon, { name: 'x', size: 11 })))),
            React.createElement('input', { placeholder: emails.length ? '' : 'Add email…' }))
        : React.createElement('div', null,
            React.createElement('div', { className: 'list-pick' },
              lists.map((l) => React.createElement('button', {
                key: l.id, type: 'button',
                className: 'list-pick-row' + (listId === l.id ? ' on' : ''),
                onClick: () => setListId(l.id),
              },
                React.createElement('span', { className: 'lp-radio' + (listId === l.id ? ' on' : '') }),
                React.createElement('span', { className: 'lp-name' }, l.name),
                React.createElement('span', { className: 'lp-count' }, l.count + ' people'))),
              creating
                ? React.createElement('div', { className: 'lp-create-row' },
                    React.createElement('input', { className: 'input', autoFocus: true, placeholder: 'List name…', value: newName, onChange: e => setNewName(e.target.value), onKeyDown: e => { if (e.key === 'Enter') createList(); if (e.key === 'Escape') setCreating(false); } }),
                    React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: createList }, 'Create'))
                : React.createElement('button', { type: 'button', className: 'lp-create-link', onClick: () => setCreating(true) },
                    React.createElement(Icon, { name: 'plus', size: 13 }), 'Create new list')),
            sel
              ? React.createElement('div', { className: 'lp-summary' }, React.createElement(Icon, { name: 'check', size: 13 }), sel.name + ' selected · ' + sel.count + ' recipients')
              : React.createElement('div', { className: 'lp-summary muted-summary' }, '0 recipients selected'),
          ),
    );
  }

  function CreateCampaign({ onClose, onLaunch, initialListId }) {
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [seqSteps, setSeqSteps] = useState([{ subject: '', timing: 'now', days: 3 }]);
    const [rmode, setRmode] = useState(initialListId ? 'list' : 'individual');
    const [listId, setListId] = useState(initialListId || null);
    const [emails, setEmails] = useState(['raj@acmecorp.com', 'lena@designstudio.de']);

    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    React.useEffect(() => { document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, []);

    return React.createElement('div', { className: 'backdrop', onMouseDown: onClose },
      React.createElement('div', { className: 'modal wide', onMouseDown: e => e.stopPropagation() },
        React.createElement('div', { className: 'modal-head' },
          React.createElement('h3', null, 'New Campaign'),
          React.createElement('div', { className: 'flex center gap12' },
            React.createElement('span', { className: 'pill-tag' }, 'STEP ' + step + ' OF 3'),
            React.createElement('button', { className: 'icon-btn', style: { width: 30, height: 30 }, onClick: onClose }, React.createElement(Icon, { name: 'x', size: 16 }))),
        ),
        React.createElement('div', { className: 'modal-body' },
          React.createElement(StepInd, { step }),
          step === 1 && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
            React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'CAMPAIGN NAME'),
              React.createElement('input', { className: 'input', placeholder: 'Q2 Outreach — Enterprise', value: name, onChange: e => setName(e.target.value) })),
            React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'FROM'),
              React.createElement('button', { className: 'select', style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, 'john@gmail.com', React.createElement(Icon, { name: 'chevDown', size: 14 }))),
            React.createElement('div', { className: 'field' }, React.createElement('label', { className: 'field-label' }, 'RECIPIENTS'),
              React.createElement(RecipientPicker, { mode: rmode, setMode: setRmode, emails, setEmails, listId, setListId }),
            ),
          ),
          step === 2 && React.createElement('div', null,
            React.createElement('h4', { style: { margin: '0 0 14px', fontSize: 15 } }, 'Build Your Sequence'),
            seqSteps.map((s, i) => React.createElement('div', { key: i, className: 'seq-step' },
              React.createElement('h4', null, 'Step ' + (i + 1)),
              React.createElement('input', { className: 'input', placeholder: 'Subject', style: { marginBottom: 8 }, value: s.subject, onChange: e => { const n = [...seqSteps]; n[i].subject = e.target.value; setSeqSteps(n); } }),
              React.createElement('div', { style: { marginBottom: 10 } }, React.createElement(window.RichEditor, { value: s.message || '', onChange: v => { const n = [...seqSteps]; n[i].message = v; setSeqSteps(n); }, minHeight: 120, mergeTags: true, placeholder: 'Message…' })),
              React.createElement('div', { className: 'flex gap12' },
                React.createElement('label', { className: 'radio-line', onClick: () => { const n = [...seqSteps]; n[i].timing = 'now'; setSeqSteps(n); } },
                  React.createElement('span', { className: 'radio-dot' + (s.timing === 'now' ? ' on' : '') }), 'Immediately'),
                React.createElement('label', { className: 'radio-line', onClick: () => { const n = [...seqSteps]; n[i].timing = 'wait'; setSeqSteps(n); } },
                  React.createElement('span', { className: 'radio-dot' + (s.timing === 'wait' ? ' on' : '') }), 'Wait ', React.createElement('input', { className: 'input', style: { width: 48, height: 28, padding: '0 8px' }, value: s.days, onChange: e => { const n = [...seqSteps]; n[i].days = e.target.value; setSeqSteps(n); } }), ' days'),
              ),
            )),
            seqSteps.length < 5 && React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => setSeqSteps([...seqSteps, { subject: '', timing: 'now', days: 3 }]) },
              React.createElement(Icon, { name: 'plus', size: 14 }), 'Add step'),
            React.createElement('p', { className: 'muted', style: { fontSize: 12.5, marginTop: 14 } }, 'Sequence pauses automatically when a recipient replies.'),
          ),
          step === 3 && React.createElement('div', null,
            React.createElement('h4', { style: { margin: '0 0 14px', fontSize: 15 } }, 'Review & Launch'),
            React.createElement('div', { className: 'seq-step' },
              React.createElement('div', { className: 'flex between', style: { marginBottom: 8 } }, React.createElement('span', { className: 'muted' }, 'Campaign'), React.createElement('b', null, name || 'Untitled campaign')),
              React.createElement('div', { className: 'flex between', style: { marginBottom: 8 } }, React.createElement('span', { className: 'muted' }, 'Recipients'), React.createElement('b', null, emails.length)),
              React.createElement('div', { className: 'flex between' }, React.createElement('span', { className: 'muted' }, 'Steps'), React.createElement('b', null, seqSteps.length)),
            ),
          ),
        ),
        React.createElement('div', { className: 'modal-foot' },
          step > 1 && React.createElement('button', { className: 'btn btn-ghost', onClick: () => setStep(step - 1) }, React.createElement(Icon, { name: 'chevLeft', size: 15 }), 'Back'),
          step < 3
            ? React.createElement('button', { className: 'btn btn-primary', disabled: step === 1 && (rmode === 'individual' ? emails.length === 0 : !listId), onClick: () => setStep(step + 1) }, 'Next', React.createElement(Icon, { name: 'arrowRight', size: 15 }))
            : React.createElement('button', { className: 'btn btn-primary', onClick: () => onLaunch(name) }, '🚀 Launch Campaign'),
        ),
      ),
    );
  }

  // ── Campaign detail view ──────────────────────────────────
  const STEP_SUBJECTS = ['Introduction to Peekd', 'Quick follow-up', 'Last check-in', 'Closing the loop', 'Final note'];
  const STEP_WAITS = [3, 5, 7, 4];

  function buildSteps(c) {
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

  function buildRecipients() {
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

  function CampaignDetail({ c, onBack, onToggleStatus, onDelete, onRename, toast }) {
    const [moreOpen, setMoreOpen] = useState(false);
    const [confirmDel, setConfirmDel] = useState(false);
    const [editing, setEditing] = useState(false);
    const [rTab, setRTab] = useState('All');
    const [person, setPerson] = useState(null);
    const paused = c.status === 'PAUSED';
    const steps = buildSteps(c);
    const recipients = buildRecipients();
    const pct = Math.round((c.step / c.steps) * 100);
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
            React.createElement('button', { onClick: () => { setMoreOpen(false); toast('Campaign duplicated'); } }, React.createElement(Icon, { name: 'grid', size: 14 }), 'Duplicate'),
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
    const [emails, setEmails] = useState(recipients.map(r => r.p.email));
    const [rmode, setRmode] = useState('individual');
    // Pre-select the list this campaign was originally created with (deterministic per campaign).
    const presetList = D.lists.length ? D.lists[Math.abs((c.id || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)) % D.lists.length] : null;
    const [listId, setListId] = useState(presetList ? presetList.id : null);
    const [seqSteps, setSeqSteps] = useState(steps.map(s => ({
      subject: s.subject,
      message: 'Hi there — following up on ' + s.subject.toLowerCase() + '. Let me know your thoughts.',
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
              React.createElement('button', { className: 'select', style: { textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, 'john@gmail.com', React.createElement(Icon, { name: 'chevDown', size: 14 }))),
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
