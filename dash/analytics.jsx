// Peekd dashboard — Analytics page.
(function () {
  const { useState, useEffect, useRef } = React;
  const Icon = window.Icon;
  const { Avatar } = window;
  const D = window.PeekdData;

  const PERIODS = {
    '7d':  { label: 'Last 7 days',   sent: '89',    or: '68.2%', rr: '28.4%', avg: '2.1', orNum: 68, points: 7, days: 7 },
    '14d': { label: 'Last 14 days',  sent: '184',   or: '73.4%', rr: '31.0%', avg: '2.4', orNum: 73, points: 14, days: 14 },
    '30d': { label: 'Last 30 days',  sent: '412',   or: '71.8%', rr: '29.6%', avg: '2.3', orNum: 72, points: 30, days: 30 },
    '3m':  { label: 'Last 3 months', sent: '1,240', or: '69.3%', rr: '27.1%', avg: '2.2', orNum: 69, points: 12, days: 90 },
  };
  const ORDER = ['7d', '14d', '30d', '3m'];
  const DAY_MS = 86_400_000;

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function parseDateInput(value) {
    if (!value) return null;
    const d = new Date(value + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /** Resolve current + prior windows of equal length for period comparison. */
  function resolvePeriodRange(period, customRange) {
    const now = new Date();
    if (period === 'custom' && customRange?.from && customRange?.to) {
      const from = startOfDay(parseDateInput(customRange.from));
      const to = endOfDay(parseDateInput(customRange.to));
      if (!from || !to || to < from) return null;
      const durationMs = to.getTime() - from.getTime() + 1;
      const priorEnd = new Date(from.getTime() - 1);
      const priorStart = new Date(priorEnd.getTime() - durationMs + 1);
      return {
        current: { start: from, end: to },
        prior: { start: priorStart, end: priorEnd },
      };
    }

    const preset = PERIODS[period] || PERIODS['14d'];
    const end = now;
    const start = new Date(end.getTime() - preset.days * DAY_MS);
    const priorEnd = new Date(start.getTime() - 1);
    const priorStart = new Date(priorEnd.getTime() - preset.days * DAY_MS);
    return {
      current: { start, end },
      prior: { start: priorStart, end: priorEnd },
    };
  }

  function formatCount(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function formatDelta(current, prior) {
    if (prior === 0) {
      if (current === 0) return { delta: '0%', up: true };
      return { delta: '', up: true };
    }
    const pct = Math.round(((current - prior) / prior) * 100);
    const up = pct >= 0;
    return { delta: (up ? '+' : '') + pct + '%', up };
  }

  async function countTrackedEmailsInRange(start, end) {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return null;
    const s = await Auth.ensureSession();
    if (!s?.user) return null;
    const sb = Auth.client();
    if (!sb) return null;

    const { count, error } = await sb
      .from('tracked_emails')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', s.user.id)
      .gte('sent_at', start.toISOString())
      .lte('sent_at', end.toISOString());

    if (error) return null;
    return count || 0;
  }

  async function fetchEmailsSentStat(period, customRange) {
    const range = resolvePeriodRange(period, customRange);
    if (!range) return { value: '0', delta: '', up: true, sub: '' };

    const [current, prior] = await Promise.all([
      countTrackedEmailsInRange(range.current.start, range.current.end),
      countTrackedEmailsInRange(range.prior.start, range.prior.end),
    ]);

    if (current == null || prior == null) {
      return { value: '—', delta: '', up: true, sub: '' };
    }

    // Same as last period — no comparison label. Also hide orphan "vs last period" when delta is blank.
    if (current === prior) {
      return { value: formatCount(current), delta: '', up: true, sub: '' };
    }

    const { delta, up } = formatDelta(current, prior);
    return { value: formatCount(current), delta, up, sub: delta ? 'vs last period' : '' };
  }

  function statsFor(p, emailsSent) {
    return [
      {
        label: 'EMAILS SENT',
        value: emailsSent?.value ?? p.sent,
        delta: emailsSent?.delta ?? '',
        up: emailsSent?.up ?? true,
        sub: emailsSent?.sub ?? 'vs last period',
      },
      { label: 'OPEN RATE', value: p.or, delta: '+4.2%', up: true, sub: 'vs last period' },
      { label: 'REPLY RATE', value: p.rr, delta: '+1.8%', up: true, sub: 'vs last period' },
      { label: 'AVG. OPENS', value: p.avg, delta: '', up: true, sub: 'per tracked email' },
    ];
  }
  function seriesFor(p) {
    const n = p.points, base = p.orNum, arr = [];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      arr.push(Math.round(base - 9 + t * 13 + Math.sin(i * 1.7) * 3));
    }
    return arr;
  }
  function replySeriesFor(p) {
    const n = p.points, base = Math.round(parseFloat(p.rr)), arr = [];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      arr.push(Math.max(0, Math.round(base - 7 + t * 9 + Math.cos(i * 1.4) * 3)));
    }
    return arr;
  }

  const LINK_DATA = [
    { url: 'getpeekd.com/demo', clicks: 24, unique: 18, ctr: 13 },
    { url: 'calendly.com/saied/30min', clicks: 17, unique: 14, ctr: 9 },
    { url: 'docs.google.com/proposal', clicks: 12, unique: 10, ctr: 7 },
    { url: 'loom.com/share/design-review', clicks: 8, unique: 7, ctr: 4 },
    { url: 'getpeekd.com/pricing', clicks: 5, unique: 5, ctr: 3 },
  ];

  function DateFilter({ period, customLabel, onSelect }) {
    const [open, setOpen] = useState(false);
    const [showCustom, setShowCustom] = useState(false);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowCustom(false); } };
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, [open]);
    const label = period === 'custom' ? (customLabel || 'Custom range') : PERIODS[period].label;
    const fmtDate = (s) => { if (!s) return ''; const d = parseDateInput(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; };
    return React.createElement('div', { className: 'date-filter', ref },
      React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => setOpen(!open) }, label, React.createElement(Icon, { name: 'chevDown', size: 14 })),
      open && React.createElement('div', { className: 'date-menu' },
        ORDER.map((k) => React.createElement('button', {
          key: k, className: 'date-opt' + (period === k ? ' on' : ''),
          onClick: () => { onSelect(k); setOpen(false); setShowCustom(false); },
        },
          React.createElement('span', { className: 'date-radio' + (period === k ? ' on' : '') }),
          PERIODS[k].label)),
        React.createElement('div', { className: 'date-sep' }),
        React.createElement('button', { className: 'date-opt' + (period === 'custom' ? ' on' : ''), onClick: () => setShowCustom(!showCustom) },
          React.createElement('span', { className: 'date-radio' + (period === 'custom' ? ' on' : '') }),
          'Custom range', React.createElement(Icon, { name: showCustom ? 'chevDown' : 'chevRight', size: 13, style: { marginLeft: 'auto' } })),
        showCustom && React.createElement('div', { className: 'date-custom' },
          React.createElement('label', null, 'From', React.createElement('input', { type: 'date', className: 'input', value: from, onChange: (e) => setFrom(e.target.value) })),
          React.createElement('label', null, 'To', React.createElement('input', { type: 'date', className: 'input', value: to, onChange: (e) => setTo(e.target.value) })),
          React.createElement('button', {
            className: 'btn btn-primary btn-sm', style: { width: '100%', marginTop: 4 },
            disabled: !from || !to || to < from,
            onClick: () => {
              onSelect('custom', {
                label: fmtDate(from) + ' – ' + fmtDate(to),
                from,
                to,
              });
              setOpen(false);
              setShowCustom(false);
            },
          }, 'Apply'),
        ),
      ),
    );
  }

  function AnalyticsPage({ toast, setHeaderExtra, free, onUpgrade }) {
    const [period, setPeriod] = useState('14d');
    const [customLabel, setCustomLabel] = useState(null);
    const [customRange, setCustomRange] = useState(null);
    const [emailsSent, setEmailsSent] = useState(null);
    const p = PERIODS[period === 'custom' ? '30d' : period];
    const stats = statsFor(p, emailsSent);
    const series = seriesFor(p);
    const replySeries = replySeriesFor(p);

    useEffect(() => {
      let cancelled = false;
      setEmailsSent({ value: '…', delta: '', up: true, sub: 'vs last period' });
      fetchEmailsSentStat(period, customRange).then((stat) => {
        if (!cancelled) setEmailsSent(stat);
      });
      return () => { cancelled = true; };
    }, [period, customRange?.from, customRange?.to]);

    useEffect(() => {
      setHeaderExtra(React.createElement('div', { className: 'flex gap8' },
        React.createElement(DateFilter, {
          period, customLabel,
          onSelect: (k, extra) => {
            if (k === 'custom') {
              setCustomLabel(extra?.label || 'Custom range');
              setCustomRange(extra?.from && extra?.to ? { from: extra.from, to: extra.to } : null);
              setPeriod('custom');
            } else {
              setCustomLabel(null);
              setCustomRange(null);
              setPeriod(k);
            }
          },
        }),
        React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => toast('Exported CSV') }, React.createElement(Icon, { name: 'download', size: 14 }), 'Export'),
      ));
      return () => setHeaderExtra(null);
    }, [period, customLabel]);

    return React.createElement('div', { className: 'page-pad analytics-page' },
      React.createElement('div', { className: 'stat-grid' },
        stats.map((s, i) => React.createElement('div', { key: i, className: 'card stat-card' },
          React.createElement('div', { className: 'sc-label' }, s.label),
          React.createElement('div', { className: 'sc-value' }, s.value),
          (s.delta || s.sub) && React.createElement('div', { className: 'sc-foot' },
            s.delta && React.createElement('span', { className: 'sc-delta ' + (s.up ? 'stat-up' : 'stat-down') }, s.delta),
            s.sub && React.createElement('span', null, s.sub)),
        )),
      ),
      React.createElement('div', { className: 'card chart-card' },
        React.createElement('h3', null, 'Open rate over time'),
        React.createElement('div', { className: 'cc-sub' }, 'Daily opens across all tracked emails · ' + (period === 'custom' ? (customLabel || 'custom range') : PERIODS[period].label.toLowerCase())),
        React.createElement(window.Chart, { key: period + (customLabel || ''), data: series, height: 220, axis: true, fmt: v => v + '%' }),
      ),
      React.createElement('div', { className: 'card chart-card' },
        React.createElement('h3', null, 'Reply rate over time'),
        React.createElement('div', { className: 'cc-sub' }, 'Daily replies across all tracked emails · ' + (period === 'custom' ? (customLabel || 'custom range') : PERIODS[period].label.toLowerCase())),
        React.createElement(window.Chart, { key: 'r' + period + (customLabel || ''), data: replySeries, height: 220, axis: true, fmt: v => v + '%', accent: '#22c55e', accentSoft: 'rgba(34,197,94,0.08)' }),
      ),
      React.createElement('div', { className: 'analytics-cols' },
        React.createElement('div', { className: 'card chart-card' },
          React.createElement('h3', null, 'Top recipients'),
          React.createElement('div', { className: 'cc-sub' }, 'By open rate'),
          D.topRecipients.map((r, i) => React.createElement('div', { key: i, className: 'recip-row' },
            React.createElement(Avatar, { initials: r.initials, size: 28 }),
            React.createElement('span', { className: 'rr-name' }, r.name),
            React.createElement('span', { className: 'rr-bar' }, React.createElement('span', { style: { width: r.rate + '%' } })),
            React.createElement('span', { className: 'rr-val' }, r.rate + '%'),
          )),
        ),
        React.createElement('div', { className: 'card chart-card' },
          React.createElement('h3', null, 'Best send times'),
          React.createElement('div', { className: 'cc-sub' }, 'Opens by day & hour'),
          React.createElement('div', { className: 'heatmap-container' },
            React.createElement(Heatmap, null),
            free && React.createElement('div', { className: 'heatmap-blur' },
              React.createElement('div', { className: 'hb-ico' }, React.createElement(Icon, { name: 'lock', size: 22 })),
              React.createElement('div', { className: 'hb-title' }, 'Best send times'),
              React.createElement('div', { className: 'hb-sub' }, 'Know exactly when your recipients are most likely to open your emails.'),
              React.createElement('button', { className: 'btn btn-upgrade btn-sm', onClick: onUpgrade },
                React.createElement(Icon, { name: 'bolt', size: 14, fill: 'currentColor', stroke: 0 }), 'Upgrade to Pro — $7/mo'),
            ),
          ),
        ),
      ),
      React.createElement('div', { className: 'card chart-card' },
        React.createElement('h3', null, 'Link performance'),
        React.createElement('div', { className: 'cc-sub' }, 'Most clicked links across all tracked emails'),
        React.createElement('div', { className: 'link-perf-wrap' },
          React.createElement('table', { className: 'link-perf' },
            React.createElement('thead', null, React.createElement('tr', null,
              React.createElement('th', null, 'URL'),
              React.createElement('th', { className: 'lp-num' }, 'CLICKS'),
              React.createElement('th', { className: 'lp-num' }, 'UNIQUE'),
              React.createElement('th', { className: 'lp-num' }, 'CTR'))),
            React.createElement('tbody', null,
              LINK_DATA.map((l, i) => React.createElement('tr', { key: i },
                React.createElement('td', null, React.createElement('span', { className: 'lp-url' },
                  React.createElement(Icon, { name: 'link', size: 14 }),
                  React.createElement('span', { className: 'lp-url-text' }, l.url.length > 40 ? l.url.slice(0, 40) + '…' : l.url))),
                React.createElement('td', { className: 'lp-num' }, React.createElement('b', null, l.clicks)),
                React.createElement('td', { className: 'lp-num muted' }, l.unique),
                React.createElement('td', { className: 'lp-num' }, React.createElement('span', { className: 'lp-ctr' },
                  React.createElement('span', { className: 'lp-ctr-bar', style: { width: (l.ctr / 13 * 100) + '%' } }),
                  React.createElement('span', { className: 'lp-ctr-val' }, l.ctr + '%'))))),
            ),
          ),
          free && React.createElement('div', { className: 'heatmap-blur' },
            React.createElement('div', { className: 'hb-ico' }, React.createElement(Icon, { name: 'link', size: 22 })),
            React.createElement('div', { className: 'hb-title' }, 'Link performance'),
            React.createElement('div', { className: 'hb-sub' }, 'See which links drive the most engagement across all your tracked emails.'),
            React.createElement('button', { className: 'btn btn-upgrade btn-sm', style: { width: 'auto', padding: '0 24px' }, onClick: onUpgrade },
              React.createElement(Icon, { name: 'bolt', size: 14, fill: 'currentColor', stroke: 0 }), 'Upgrade to Pro — $7/mo'),
          ),
        ),
      ),
    );
  }

  function Heatmap() {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayFull = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
    const hours = [['6a', '6 AM'], ['9a', '9 AM'], ['12p', '12 PM'], ['3p', '3 PM'], ['6p', '6 PM'], ['9p', '9 PM']];
    const seed = (r, c) => (Math.sin(r * 12.9898 + c * 78.233) * 43758.5453 % 1 + 1) % 1;
    return React.createElement('div', { className: 'heatmap-grid' },
      React.createElement('span', null),
      days.map(d => React.createElement('span', { key: d, className: 'heat-lbl heat-day' }, d)),
      hours.map(([hr, hLong], r) => [
        React.createElement('span', { key: 'l' + r, className: 'heat-lbl heat-time' }, hr),
        ...days.map((d, c) => {
          const s = seed(r, c);
          const opens = Math.round(2 + s * 13);
          const best = opens >= 11;
          return React.createElement('div', { key: r + '-' + c, className: 'heat-cell' + (best ? ' heat-best' : ''), style: { '--cell': (0.15 + s * 0.85).toFixed(3) } },
            React.createElement('span', { className: 'heat-tip' },
              React.createElement('b', { className: 'day-time' }, dayFull[d] + ' ' + hLong),
              React.createElement('span', { className: 'opens' }, opens + ' opens' + (best ? ' · Best time to send' : ''))),
          );
        }),
      ]),
    );
  }

  window.AnalyticsPage = AnalyticsPage;
})();
