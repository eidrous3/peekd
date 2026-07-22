// Peekd dashboard — Analytics page.
(function () {
  const { useState, useEffect, useRef } = React;
  const Icon = window.Icon;
  const { Avatar } = window;

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

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function dayKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function eachDay(start, end) {
    const days = [];
    const cur = startOfDay(start);
    const last = startOfDay(end);
    while (cur.getTime() <= last.getTime()) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  function formatChartDayLabel(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function displayNameFromEmail(email) {
    const local = normalizeEmail(email).split('@')[0] || 'Recipient';
    return local.split(/[._-]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || local;
  }

  function initialsFromNameOrEmail(name, email) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    const local = normalizeEmail(email).split('@')[0] || '';
    const chunks = local.split(/[._-]+/).filter(Boolean);
    if (chunks.length >= 2) return (chunks[0][0] + chunks[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase() || '?';
  }

  function fullName(first, last) {
    return [String(first || '').trim(), String(last || '').trim()].filter(Boolean).join(' ');
  }

  const TOP_RECIPIENTS_LIMIT = 14;
  const LINK_PERF_LIMIT = 10;

  const HEAT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const HEAT_DAY_FULL = {
    Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
    Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
  };
  // 8 × 3-hour buckets covering a full 24h day, starting at 6 AM (local).
  const HEAT_HOURS = [
    { key: '6-9a', label: '6–9a', tip: '6–9 AM', startHour: 6 },
    { key: '9-12p', label: '9–12p', tip: '9 AM–12 PM', startHour: 9 },
    { key: '12-3p', label: '12–3p', tip: '12–3 PM', startHour: 12 },
    { key: '3-6p', label: '3–6p', tip: '3–6 PM', startHour: 15 },
    { key: '6-9p', label: '6–9p', tip: '6–9 PM', startHour: 18 },
    { key: '9-12a', label: '9–12a', tip: '9 PM–12 AM', startHour: 21 },
    { key: '12-3a', label: '12–3a', tip: '12–3 AM', startHour: 0 },
    { key: '3-6a', label: '3–6a', tip: '3–6 AM', startHour: 3 },
  ];

  function heatDayIndex(date) {
    const jsDay = date.getDay(); // 0 = Sun … 6 = Sat
    return jsDay === 0 ? 6 : jsDay - 1; // Mon = 0 … Sun = 6
  }

  function heatHourIndex(date) {
    const h = date.getHours();
    if (h >= 6 && h < 9) return 0;
    if (h >= 9 && h < 12) return 1;
    if (h >= 12 && h < 15) return 2;
    if (h >= 15 && h < 18) return 3;
    if (h >= 18 && h < 21) return 4;
    if (h >= 21) return 5;
    if (h < 3) return 6;
    return 7; // 3–6 AM
  }

  function emptyHeatCell() {
    return { emailsSent: 0, uniqueOpens: 0, opens: 0 };
  }

  function buildSendTimesHeatmap(cells, emailsSent, openedRecipients) {
    const avgRate = emailsSent > 0 ? openedRecipients / emailsSent : 0;
    let maxRate = 0;
    const grid = HEAT_HOURS.map((hour, hourIdx) =>
      HEAT_DAYS.map((day, dayIdx) => {
        const cell = cells[hourIdx][dayIdx];
        const rate = cell.emailsSent > 0 ? cell.uniqueOpens / cell.emailsSent : 0;
        if (rate > maxRate) maxRate = rate;
        return {
          day,
          hour: hour.label,
          hourTip: hour.tip,
          emailsSent: cell.emailsSent,
          uniqueOpens: cell.uniqueOpens,
          opens: cell.opens,
          rate,
          best: false,
        };
      }),
    );

    for (const row of grid) {
      for (const cell of row) {
        cell.best = cell.emailsSent > 0 && avgRate > 0 && cell.rate > avgRate;
        cell.intensity = maxRate > 0 ? Math.min(1, cell.rate / maxRate) : 0;
      }
    }

    return { grid, avgRate, maxRate };
  }

  function displayUrlForLink(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.host.replace(/^www\./i, '');
      const path = parsed.pathname === '/' ? '' : parsed.pathname;
      return (host + path) || host;
    } catch {
      return String(url || '').replace(/^https?:\/\//i, '').slice(0, 80);
    }
  }

  function isCountableClick(event) {
    return event?.classification !== 'likely_proxy';
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

  function formatRate(pct) {
    if (pct == null || Number.isNaN(pct)) return '—';
    const rounded = Math.round(pct * 10) / 10;
    return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + '%';
  }

  function formatAvgOpens(value) {
    if (value == null || Number.isNaN(value)) return '—';
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
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

  /** Absolute change in rate percentage points (e.g. 73.4 − 69.2 → +4.2%). */
  function formatRateDelta(currentRate, priorRate) {
    if (currentRate == null || priorRate == null) return { delta: '', up: true };
    const pts = Math.round((currentRate - priorRate) * 10) / 10;
    if (pts === 0) return { delta: '', up: true };
    const up = pts > 0;
    const text = (up ? '+' : '') + (Number.isInteger(pts) ? String(pts) : pts.toFixed(1)) + '%';
    return { delta: text, up };
  }

  function emptyStat() {
    return { value: '—', delta: '', up: true, sub: '' };
  }

  function comparisonStat(value, delta, up) {
    if (!delta) return { value, delta: '', up: true, sub: '' };
    return { value, delta, up, sub: 'vs last period' };
  }

  async function getAnalyticsClient() {
    const Auth = window.PeekdAuth;
    if (!Auth?.ready()) return null;
    const s = await Auth.ensureSession();
    if (!s?.user) return null;
    const sb = Auth.client();
    if (!sb) return null;
    return { sb, userId: s.user.id };
  }

  async function enrichRecipientNames(client, rows) {
    if (!client || !rows.length) return rows;
    const emails = rows.map((r) => r.email).filter(Boolean);
    if (!emails.length) return rows;

    const { data, error } = await client.sb
      .from('people')
      .select('email, first_name, last_name')
      .eq('user_id', client.userId)
      .in('email', emails);

    if (error || !Array.isArray(data)) return rows;

    const byEmail = new Map();
    for (const person of data) {
      const email = normalizeEmail(person.email);
      if (!email) continue;
      const name = fullName(person.first_name, person.last_name);
      if (name) byEmail.set(email, name);
    }

    return rows.map((row) => {
      const name = byEmail.get(row.email) || row.name;
      return {
        ...row,
        name,
        initials: initialsFromNameOrEmail(name, row.email),
      };
    });
  }

  async function fetchWindowStats(start, end) {
    const client = await getAnalyticsClient();
    if (!client) return null;

    const { data, error } = await client.sb
      .from('tracked_emails')
      .select('id, sent_at, tracked_recipients(id, email, is_replied, email_open_events(classification)), tracked_links(id, original_url, email_click_events(id, classification, ip))')
      .eq('user_id', client.userId)
      .gte('sent_at', start.toISOString())
      .lte('sent_at', end.toISOString());

    if (error || !Array.isArray(data)) return null;

    let sentRecipients = 0;
    let openedRecipients = 0;
    let repliedRecipients = 0;
    const byRecipient = new Map();
    const byLink = new Map();
    const heatCells = HEAT_HOURS.map(() => HEAT_DAYS.map(() => emptyHeatCell()));
    const days = eachDay(start, end);
    const byDay = new Map(days.map((d) => [dayKey(d), { recipients: 0, opened: 0, replied: 0 }]));

    for (const email of data) {
      const dayBucket = byDay.get(dayKey(email.sent_at));
      const recipients = email.tracked_recipients || [];
      const recipientCount = recipients.length;
      let viewedOnEmail = 0;
      let uniqueOpensOnEmail = 0;
      let opensOnEmail = 0;
      for (const recipient of recipients) {
        sentRecipients += 1;
        const humanEvents = (recipient.email_open_events || []).filter((ev) => ev.classification === 'human');
        const opened = humanEvents.length > 0;
        if (opened) {
          openedRecipients += 1;
          viewedOnEmail += 1;
          uniqueOpensOnEmail += 1;
          opensOnEmail += humanEvents.length;
        }
        if (recipient.is_replied) repliedRecipients += 1;

        if (dayBucket) {
          dayBucket.recipients += 1;
          if (opened) dayBucket.opened += 1;
          if (recipient.is_replied) dayBucket.replied += 1;
        }

        const addr = normalizeEmail(recipient.email);
        if (!addr) continue;
        const cur = byRecipient.get(addr) || { email: addr, sent: 0, opened: 0 };
        cur.sent += 1;
        if (opened) cur.opened += 1;
        byRecipient.set(addr, cur);
      }

      const sentAt = email.sent_at ? new Date(email.sent_at) : null;
      if (sentAt && !Number.isNaN(sentAt.getTime())) {
        const heat = heatCells[heatHourIndex(sentAt)][heatDayIndex(sentAt)];
        heat.emailsSent += 1;
        heat.uniqueOpens += uniqueOpensOnEmail;
        heat.opens += opensOnEmail;
      }

      for (const link of email.tracked_links || []) {
        const url = displayUrlForLink(link.original_url);
        if (!url) continue;
        const cur = byLink.get(url) || {
          url,
          clicks: 0,
          clickedRecipients: 0,
          viewedRecipients: 0,
        };
        const events = (link.email_click_events || []).filter(isCountableClick);
        cur.clicks += events.length;
        cur.viewedRecipients += viewedOnEmail;

        // Attribute clickers to recipients: 1:1 send is exact; multi-recipient uses distinct IPs.
        const clickIps = new Set();
        for (let i = 0; i < events.length; i++) {
          const ev = events[i];
          clickIps.add(String(ev.ip || ev.id || ('anon:' + link.id + ':' + i)).trim());
        }
        let clickedOnEmail = 0;
        if (events.length > 0) {
          clickedOnEmail = recipientCount <= 1
            ? 1
            : Math.min(clickIps.size, recipientCount);
        }
        cur.clickedRecipients += clickedOnEmail;
        byLink.set(url, cur);
      }
    }

    const emailsSent = data.length;
    // Avg opens = unique opens / emails sent (unique = recipients with ≥1 human open).
    const avgOpens = emailsSent > 0 ? openedRecipients / emailsSent : null;

    const dayLabels = days.map((d) => formatChartDayLabel(d));
    const rateSeries = (field) => days.map((d) => {
      const bucket = byDay.get(dayKey(d));
      if (!bucket || bucket.recipients === 0) return 0;
      return Math.round((bucket[field] / bucket.recipients) * 1000) / 10;
    });
    const openSeries = { values: rateSeries('opened'), labels: dayLabels };
    const replySeries = { values: rateSeries('replied'), labels: dayLabels };

    // Top recipients by open rate in this window: opened sends / sent sends.
    const topRecipients = [...byRecipient.values()]
      .filter((r) => r.sent > 0)
      .map((r) => {
        const rate = Math.round((r.opened / r.sent) * 100);
        const name = displayNameFromEmail(r.email);
        return {
          email: r.email,
          name,
          initials: initialsFromNameOrEmail(name, r.email),
          rate,
          sent: r.sent,
        };
      })
      .sort((a, b) => b.rate - a.rate || b.sent - a.sent)
      .slice(0, TOP_RECIPIENTS_LIMIT);

    // Link performance: aggregate by display URL across sends in this window.
    // clicks = countable events; unique = recipients who clicked;
    // CTR = recipients who clicked / recipients who viewed (opened) emails with that URL.
    const linkPerformance = [...byLink.values()]
      .filter((row) => row.clicks > 0)
      .map((row) => {
        const unique = row.clickedRecipients;
        const ctr = row.viewedRecipients > 0
          ? Math.min(100, Math.round((unique / row.viewedRecipients) * 100))
          : 0;
        return {
          url: row.url,
          clicks: row.clicks,
          unique,
          ctr,
        };
      })
      .sort((a, b) => b.clicks - a.clicks || b.unique - a.unique)
      .slice(0, LINK_PERF_LIMIT);

    const sendTimes = buildSendTimesHeatmap(heatCells, emailsSent, openedRecipients);

    return {
      emailsSent,
      sentRecipients,
      openedRecipients,
      repliedRecipients,
      openRate: sentRecipients > 0 ? (openedRecipients / sentRecipients) * 100 : null,
      replyRate: sentRecipients > 0 ? (repliedRecipients / sentRecipients) * 100 : null,
      avgOpens,
      openSeries,
      replySeries,
      topRecipients,
      linkPerformance,
      sendTimes,
    };
  }

  async function fetchAnalyticsStats(period, customRange) {
    const range = resolvePeriodRange(period, customRange);
    if (!range) {
      return {
        emailsSent: { value: '0', delta: '', up: true, sub: '' },
        openRate: { value: '—', delta: '', up: true, sub: '' },
        replyRate: { value: '—', delta: '', up: true, sub: '' },
        avgOpens: { value: '—', delta: '', up: true, sub: 'per tracked email' },
        openSeries: { values: [], labels: [] },
        replySeries: { values: [], labels: [] },
        topRecipients: [],
        linkPerformance: [],
        sendTimes: null,
      };
    }

    const [current, prior] = await Promise.all([
      fetchWindowStats(range.current.start, range.current.end),
      fetchWindowStats(range.prior.start, range.prior.end),
    ]);

    if (!current || !prior) {
      return {
        emailsSent: emptyStat(),
        openRate: emptyStat(),
        replyRate: emptyStat(),
        avgOpens: { value: '—', delta: '', up: true, sub: 'per tracked email' },
        openSeries: { values: [], labels: [] },
        replySeries: { values: [], labels: [] },
        topRecipients: [],
        linkPerformance: [],
        sendTimes: null,
      };
    }

    let emailsSent;
    if (current.emailsSent === prior.emailsSent) {
      emailsSent = { value: formatCount(current.emailsSent), delta: '', up: true, sub: '' };
    } else {
      const { delta, up } = formatDelta(current.emailsSent, prior.emailsSent);
      emailsSent = comparisonStat(formatCount(current.emailsSent), delta, up);
    }

    let openRate;
    if (current.openRate == null) {
      openRate = { value: '—', delta: '', up: true, sub: '' };
    } else {
      const { delta, up } = formatRateDelta(current.openRate, prior.openRate);
      openRate = comparisonStat(formatRate(current.openRate), delta, up);
    }

    let replyRate;
    if (current.replyRate == null) {
      replyRate = { value: '—', delta: '', up: true, sub: '' };
    } else {
      const { delta, up } = formatRateDelta(current.replyRate, prior.replyRate);
      replyRate = comparisonStat(formatRate(current.replyRate), delta, up);
    }

    let avgOpens;
    if (current.avgOpens == null) {
      avgOpens = { value: '—', delta: '', up: true, sub: 'per tracked email' };
    } else {
      avgOpens = {
        value: formatAvgOpens(current.avgOpens),
        delta: '',
        up: true,
        sub: 'per tracked email',
      };
    }

    const client = await getAnalyticsClient();
    const topRecipients = await enrichRecipientNames(client, current.topRecipients || []);

    return {
      emailsSent,
      openRate,
      replyRate,
      avgOpens,
      openSeries: current.openSeries || { values: [], labels: [] },
      replySeries: current.replySeries || { values: [], labels: [] },
      topRecipients,
      linkPerformance: current.linkPerformance || [],
      sendTimes: current.sendTimes || null,
    };
  }

  function statsFor(p, emailsSent, openRate, replyRate, avgOpens) {
    return [
      {
        label: 'EMAILS SENT',
        value: emailsSent?.value ?? p.sent,
        delta: emailsSent?.delta ?? '',
        up: emailsSent?.up ?? true,
        sub: emailsSent?.sub ?? '',
      },
      {
        label: 'OPEN RATE',
        value: openRate?.value ?? p.or,
        delta: openRate?.delta ?? '',
        up: openRate?.up ?? true,
        sub: openRate?.sub ?? '',
      },
      {
        label: 'REPLY RATE',
        value: replyRate?.value ?? p.rr,
        delta: replyRate?.delta ?? '',
        up: replyRate?.up ?? true,
        sub: replyRate?.sub ?? '',
      },
      {
        label: 'AVG. OPENS',
        value: avgOpens?.value ?? p.avg,
        delta: avgOpens?.delta ?? '',
        up: avgOpens?.up ?? true,
        sub: avgOpens?.sub ?? 'per tracked email',
      },
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
    const [openRate, setOpenRate] = useState(null);
    const [replyRate, setReplyRate] = useState(null);
    const [avgOpens, setAvgOpens] = useState(null);
    const [openSeries, setOpenSeries] = useState({ values: [], labels: [] });
    const [replySeriesLive, setReplySeriesLive] = useState({ values: [], labels: [] });
    const [topRecipients, setTopRecipients] = useState(null);
    const [linkPerformance, setLinkPerformance] = useState(null);
    const [sendTimes, setSendTimes] = useState(null);
    const p = PERIODS[period === 'custom' ? '30d' : period];
    const stats = statsFor(p, emailsSent, openRate, replyRate, avgOpens);
    const series = openSeries.values.length ? openSeries.values : seriesFor(p);
    const seriesLabels = openSeries.labels.length === series.length ? openSeries.labels : null;
    const replySeries = replySeriesLive.values.length ? replySeriesLive.values : replySeriesFor(p);
    const replySeriesLabels = replySeriesLive.labels.length === replySeries.length ? replySeriesLive.labels : null;
    const periodLabel = period === 'custom' ? (customLabel || 'custom range') : PERIODS[period].label.toLowerCase();
    const topList = Array.isArray(topRecipients) ? topRecipients : [];
    const linkList = Array.isArray(linkPerformance) ? linkPerformance : [];
    const maxLinkCtr = Math.max(...linkList.map((l) => l.ctr), 1);

    useEffect(() => {
      let cancelled = false;
      const loading = { value: '…', delta: '', up: true, sub: '' };
      setEmailsSent(loading);
      setOpenRate(loading);
      setReplyRate(loading);
      setAvgOpens({ value: '…', delta: '', up: true, sub: 'per tracked email' });
      setOpenSeries({ values: [], labels: [] });
      setReplySeriesLive({ values: [], labels: [] });
      setTopRecipients(null);
      setLinkPerformance(null);
      setSendTimes(null);
      fetchAnalyticsStats(period, customRange).then((stats) => {
        if (cancelled) return;
        setEmailsSent(stats.emailsSent);
        setOpenRate(stats.openRate);
        setReplyRate(stats.replyRate);
        setAvgOpens(stats.avgOpens);
        setOpenSeries(stats.openSeries || { values: [], labels: [] });
        setReplySeriesLive(stats.replySeries || { values: [], labels: [] });
        setTopRecipients(stats.topRecipients || []);
        setLinkPerformance(stats.linkPerformance || []);
        setSendTimes(stats.sendTimes || null);
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
        React.createElement('div', { className: 'cc-sub' }, 'Daily open rate for emails sent · ' + periodLabel),
        React.createElement(window.Chart, {
          key: 'or-' + period + (customLabel || '') + series.length,
          data: series,
          labels: seriesLabels,
          height: 220,
          axis: true,
          fmt: (v) => v + '%',
        }),
      ),
      React.createElement('div', { className: 'card chart-card' },
        React.createElement('h3', null, 'Reply rate over time'),
        React.createElement('div', { className: 'cc-sub' }, 'Daily reply rate for emails sent · ' + periodLabel),
        React.createElement(window.Chart, {
          key: 'rr-' + period + (customLabel || '') + replySeries.length,
          data: replySeries,
          labels: replySeriesLabels,
          height: 220,
          axis: true,
          fmt: (v) => v + '%',
          accent: '#22c55e',
          accentSoft: 'rgba(34,197,94,0.08)',
        }),
      ),
      React.createElement('div', { className: 'analytics-cols' },
        React.createElement('div', { className: 'card chart-card' },
          React.createElement('h3', null, 'Top recipients'),
          React.createElement('div', { className: 'cc-sub' }, 'By open rate · ' + periodLabel),
          topRecipients == null
            ? React.createElement('div', { className: 'cc-sub', style: { marginTop: 12 } }, 'Loading…')
            : topList.length
              ? topList.map((r, i) => React.createElement('div', { key: r.email || i, className: 'recip-row' },
                  React.createElement(Avatar, { initials: r.initials, size: 28 }),
                  React.createElement('span', { className: 'rr-name' }, r.name),
                  React.createElement('span', { className: 'rr-bar' }, React.createElement('span', { style: { width: r.rate + '%' } })),
                  React.createElement('span', { className: 'rr-val' }, r.rate + '%'),
                ))
              : React.createElement('div', { className: 'cc-sub', style: { marginTop: 12 } }, 'No tracked recipients in this period'),
        ),
        React.createElement('div', { className: 'card chart-card' },
          React.createElement('h3', null, 'Best send times'),
          React.createElement('div', { className: 'cc-sub' }, 'Unique opens per send by day & hour · ' + periodLabel),
          React.createElement('div', { className: 'heatmap-container' },
            React.createElement(Heatmap, { data: sendTimes }),
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
        React.createElement('div', { className: 'cc-sub' }, 'Most clicked links · ' + periodLabel),
        React.createElement('div', { className: 'link-perf-wrap' },
          React.createElement('table', { className: 'link-perf' },
            React.createElement('thead', null, React.createElement('tr', null,
              React.createElement('th', null, 'URL'),
              React.createElement('th', { className: 'lp-num' }, 'CLICKS'),
              React.createElement('th', { className: 'lp-num' }, 'UNIQUE'),
              React.createElement('th', { className: 'lp-num' }, 'CTR'))),
            React.createElement('tbody', null,
              linkPerformance == null
                ? React.createElement('tr', null,
                    React.createElement('td', { colSpan: 4, className: 'muted' }, 'Loading…'))
                : linkList.length
                  ? linkList.map((l, i) => React.createElement('tr', { key: l.url || i },
                      React.createElement('td', null, React.createElement('span', { className: 'lp-url' },
                        React.createElement(Icon, { name: 'link', size: 14 }),
                        React.createElement('span', { className: 'lp-url-text' }, l.url.length > 40 ? l.url.slice(0, 40) + '…' : l.url))),
                      React.createElement('td', { className: 'lp-num' }, React.createElement('b', null, l.clicks)),
                      React.createElement('td', { className: 'lp-num muted' }, l.unique),
                      React.createElement('td', { className: 'lp-num' }, React.createElement('span', { className: 'lp-ctr' },
                        React.createElement('span', { className: 'lp-ctr-bar', style: { width: (l.ctr / maxLinkCtr * 100) + '%' } }),
                        React.createElement('span', { className: 'lp-ctr-val' }, l.ctr + '%')))))
                  : React.createElement('tr', null,
                      React.createElement('td', { colSpan: 4, className: 'muted' }, 'No link clicks in this period')),
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

  function Heatmap({ data }) {
    const grid = data?.grid;
    const avgRate = data?.avgRate || 0;
    const avgPct = Math.round(avgRate * 100);

    return React.createElement('div', { className: 'heatmap-grid' },
      React.createElement('span', null),
      HEAT_DAYS.map((d) => React.createElement('span', { key: d, className: 'heat-lbl heat-day' }, d)),
      HEAT_HOURS.map((hour, r) => [
        React.createElement('span', { key: 'l' + r, className: 'heat-lbl heat-time' }, hour.label),
        ...HEAT_DAYS.map((d, c) => {
          const cell = grid?.[r]?.[c];
          const intensity = cell ? cell.intensity : 0;
          const opens = cell?.opens || 0;
          const emails = cell?.emailsSent || 0;
          const ratePct = cell ? Math.round(cell.rate * 100) : 0;
          const best = !!(cell && cell.best);
          const tipBody = !cell || emails === 0
            ? 'No sends in this slot'
            : (opens + ' open' + (opens === 1 ? '' : 's')
              + ' · ' + ratePct + '% unique/send'
              + (best ? ' · Best time to send' : ''));
          return React.createElement('div', {
            key: r + '-' + c,
            className: 'heat-cell' + (best ? ' heat-best' : '') + (emails === 0 ? ' heat-empty' : ''),
            style: { '--cell': (emails === 0 ? 0.06 : Math.max(0.12, intensity)).toFixed(3) },
          },
            React.createElement('span', { className: 'heat-tip' },
              React.createElement('b', { className: 'day-time' }, HEAT_DAY_FULL[d] + ' ' + hour.tip),
              React.createElement('span', { className: 'opens' }, tipBody),
              emails > 0 && avgRate > 0 && React.createElement('span', { className: 'opens' },
                'Avg ' + avgPct + '% · ' + emails + ' send' + (emails === 1 ? '' : 's')),
            ),
          );
        }),
      ]),
    );
  }

  window.AnalyticsPage = AnalyticsPage;
})();
