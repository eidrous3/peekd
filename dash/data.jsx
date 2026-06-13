// Peekd dashboard — realistic sample data.
(function () {
  const avatarColors = {
    EC: '#2563eb', MC: '#7c3aed', OB: '#0891b2', PR: '#d97706',
    TR: '#16a34a', DO: '#db2777', AW: '#dc2626', NB: '#0d9488',
    SM: '#2563eb', JO: '#dc2626', LH: '#16a34a', CR: '#d97706', PN: '#7c3aed',
    HM: '#2563eb',
  };

  const emails = [
    {
      id: 'e1', from: 'john@gmail.com', initials: 'EC', name: 'Elena Castro', email: 'elena@northwind.co',
      subject: 'Re: Q2 partnership renewal — final terms', preview: 'Thanks for the redline — one open question on the SLA…',
      badge: 'OPENED', opens: 3, time: '12m ago', sentAt: 'Yesterday, 16:22', unread: true, hot: false,
      to: 'Elena Castro', toEmail: 'elena@northwind.co', cc: ['legal@northwind.co'], bcc: [],
      device: 'iPhone', location: 'Austin, TX', lastOpened: '2m ago',
      timeline: [
        { type: 'sent', label: 'Sent', meta: 'Yesterday, 16:22' },
        { type: 'delivered', label: 'Delivered', meta: 'Yesterday, 16:22' },
        { type: 'opened', who: 'Elena Castro', av: 'EC', label: 'opened', meta: 'iPhone · Austin, TX', time: '18:40' },
        { type: 'opened', who: 'Elena Castro', av: 'EC', label: 'opened again (×2)', meta: 'MacBook · Austin, TX', time: 'Today, 09:14' },
        { type: 'link', who: 'Elena Castro', av: 'EC', label: 'clicked a link (×3)', meta: 'getpeekd.com/changelog', time: '09:15' },
        { type: 'opened', who: 'Elena Castro', av: 'EC', label: 'opened again (×3)', meta: 'iPhone · Austin, TX', time: '2m ago' },
      ],
      links: [
        { url: 'getpeekd.com/changelog', clicks: 4, last: '47m ago', by: 'Elena Castro ×3 · legal@northwind.co ×1', w: 100 },
        { url: 'loom.com/share/design-review', clicks: 2, last: '1hr ago', by: 'Elena Castro ×2', w: 50 },
      ],
      ai: { name: 'Elena', count: 3, text: "Hi Elena — just circling back on the SLA question from the renewal terms. Happy to hop on a quick call this week if that's easier. Want me to send a few times?" },
    },
    {
      id: 'e2', from: 'work@company.com', initials: 'MC', name: 'Marcus Chen', email: 'marcus@figmacore.com',
      subject: "Design review notes from Tuesday's session", preview: 'Captured everything from the call — see the doc…',
      badge: 'REPLIED', opens: 2, time: '1h ago', sentAt: 'Tuesday, 11:05', unread: false, hot: false,
      to: 'Marcus Chen', toEmail: 'marcus@figmacore.com', cc: [], bcc: [],
      device: 'MacBook', location: 'San Francisco, CA', lastOpened: '1h ago',
      timeline: [
        { type: 'sent', label: 'Sent', meta: 'Tuesday, 11:05' },
        { type: 'delivered', label: 'Delivered', meta: 'Tuesday, 11:05' },
        { type: 'opened', who: 'Marcus Chen', av: 'MC', label: 'opened', meta: 'MacBook · San Francisco', time: '11:31' },
        { type: 'replied', who: 'Marcus Chen', av: 'MC', label: 'replied', meta: '"Looks great, shipping it"', time: '12:48' },
      ],
      links: [],
      ai: null,
    },
    {
      id: 'e3', from: 'john@gmail.com', initials: 'OB', name: 'Omar Bishara', email: 'omar@bishara.io',
      subject: 'Following up on the proposal', preview: 'Wanted to check whether the numbers work on your end…',
      badge: 'OPENED', opens: 4, time: '2h ago', sentAt: 'Monday, 09:10', unread: false, hot: false,
      to: 'Omar Bishara', toEmail: 'omar@bishara.io', cc: [], bcc: [],
      device: 'Android', location: 'London, UK', lastOpened: '2h ago',
      timeline: [
        { type: 'sent', label: 'Sent', meta: 'Monday, 09:10' },
        { type: 'delivered', label: 'Delivered', meta: 'Monday, 09:10' },
        { type: 'opened', who: 'Omar Bishara', av: 'OB', label: 'opened (×4)', meta: 'Android · London, UK', time: '2h ago' },
      ],
      links: [{ url: 'getpeekd.com/pricing', clicks: 2, last: '2h ago', by: 'Omar Bishara ×2', w: 50 }],
      ai: { name: 'Omar', count: 4, text: "Hi Omar — saw the proposal caught your eye a few times. Any questions on the pricing I can clear up? Glad to tailor the plan to your team size." },
    },
    {
      id: 'e4', from: 'john@outlook.com', initials: 'PR', name: 'Paige Romano', email: 'paige@romano-cpa.com',
      subject: 'Updated invoice #2098 — net 30', preview: 'Attached the revised invoice with the agreed terms…',
      badge: 'SENT', opens: 0, time: '3h ago', sentAt: 'Today, 08:30', unread: false, hot: false,
      to: 'Paige Romano', toEmail: 'paige@romano-cpa.com', cc: [], bcc: [],
      device: '—', location: '—', lastOpened: '—',
      timeline: [
        { type: 'sent', label: 'Sent', meta: 'Today, 08:30' },
        { type: 'delivered', label: 'Delivered', meta: 'Today, 08:30' },
      ],
      links: [], ai: null,
    },
    {
      id: 'e5', from: 'john@gmail.com', initials: 'TR', name: 'Theo Reyes', email: 'theo@reyes.dev',
      subject: "Coffee next week? I'm in town Tue–Thu", preview: 'Would love to catch up while I\'m in the city…',
      badge: 'OPENED', opens: 2, time: '5h ago', sentAt: 'Today, 07:50', unread: false, hot: false,
      to: 'Theo Reyes', toEmail: 'theo@reyes.dev', cc: [], bcc: [],
      device: 'iPhone', location: 'New York, NY', lastOpened: '5h ago',
      timeline: [
        { type: 'sent', label: 'Sent', meta: 'Today, 07:50' },
        { type: 'delivered', label: 'Delivered', meta: 'Today, 07:50' },
        { type: 'opened', who: 'Theo Reyes', av: 'TR', label: 'opened (×2)', meta: 'iPhone · New York', time: '5h ago' },
      ],
      links: [], ai: null,
    },
    {
      id: 'e6', from: 'work@company.com', initials: 'DO', name: 'Dara Okonkwo', email: 'dara@hiringloop.com',
      subject: "Re: Hiring loop — Sofia's panel feedback", preview: 'Consolidated the panel\'s notes, see below…',
      badge: 'REPLIED', opens: 5, time: 'Yesterday', sentAt: 'Apr 30, 14:00', unread: false, hot: false,
      to: 'Dara Okonkwo', toEmail: 'dara@hiringloop.com', cc: ['sofia@hiringloop.com'], bcc: [],
      device: 'MacBook', location: 'Berlin, DE', lastOpened: 'Yesterday',
      timeline: [
        { type: 'sent', label: 'Sent', meta: 'Apr 30, 14:00' },
        { type: 'delivered', label: 'Delivered', meta: 'Apr 30, 14:00' },
        { type: 'opened', who: 'Dara Okonkwo', av: 'DO', label: 'opened (×5)', meta: 'MacBook · Berlin', time: 'Yesterday' },
        { type: 'replied', who: 'Dara Okonkwo', av: 'DO', label: 'replied', meta: '"Thanks, scheduling now"', time: 'Yesterday' },
      ],
      links: [], ai: null,
    },
    {
      id: 'e7', from: 'john@outlook.com', initials: 'AW', name: 'Amelia Wong', email: 'amelia@brightwave.com',
      subject: 'Onboarding deck v3 — diff highlighted', preview: 'Pushed the v3 changes, the diffs are highlighted in red…',
      badge: 'OPENED', opens: 7, time: 'Yesterday', sentAt: 'Apr 29, 10:20', unread: true, hot: true,
      to: 'Amelia Wong', toEmail: 'amelia@brightwave.com', cc: [], bcc: [],
      device: 'iPhone', location: 'Seattle, WA', lastOpened: '20m ago',
      timeline: [
        { type: 'sent', label: 'Sent', meta: 'Apr 29, 10:20' },
        { type: 'delivered', label: 'Delivered', meta: 'Apr 29, 10:20' },
        { type: 'opened', who: 'Amelia Wong', av: 'AW', label: 'opened', meta: 'MacBook · Seattle', time: 'Apr 29' },
        { type: 'opened', who: 'Amelia Wong', av: 'AW', label: 'opened again (×7)', meta: 'iPhone · Seattle', time: '20m ago' },
        { type: 'link', who: 'Amelia Wong', av: 'AW', label: 'clicked a link (×2)', meta: 'getpeekd.com/demo', time: '22m ago' },
      ],
      links: [{ url: 'getpeekd.com/demo', clicks: 2, last: '22m ago', by: 'Amelia Wong ×2', w: 50 }],
      ai: { name: 'Amelia', count: 7, text: "Hi Amelia — looks like the onboarding deck is getting a lot of attention on your side. Want me to walk the team through v3 live? I can set up 20 minutes this week." },
    },
    {
      id: 'e8', from: 'john@gmail.com', initials: 'NB', name: 'Noah Brenner', email: 'noah@copyfold.com',
      subject: 'Quick gut-check on the pricing page copy', preview: 'Two versions attached — curious which reads stronger…',
      badge: 'SENT', opens: 0, time: 'Yesterday', sentAt: 'Apr 29, 09:00', unread: false, hot: false,
      to: 'Noah Brenner', toEmail: 'noah@copyfold.com', cc: [], bcc: [],
      device: '—', location: '—', lastOpened: '—',
      timeline: [
        { type: 'sent', label: 'Sent', meta: 'Apr 29, 09:00' },
        { type: 'delivered', label: 'Delivered', meta: 'Apr 29, 09:00' },
      ],
      links: [], ai: null,
    },
  ];

  const notifications = [
    { id: 'n1', type: 'open', who: 'Sarah Mitchell', text: 'opened "Q2 Proposal"', time: '2m ago', unread: true },
    { id: 'n2', type: 'open', who: 'James Okafor', text: 'opened "Follow-up" · 3rd time', time: '15m ago', unread: true },
    { id: 'n3', type: 'reply', who: 'Lena Hoffmann', text: 'read your reply', time: '1h ago', unread: false },
    { id: 'n4', type: 'open', who: 'Carlos Rivera', text: 'opened "Introduction"', time: '3h ago', unread: false },
    { id: 'n5', type: 'reply', who: 'Priya Nair', text: 'read your reply', time: 'Yesterday', unread: false },
  ];

  const stats = [
    { label: 'EMAILS SENT', value: '184', delta: '+12%', up: true, sub: 'vs last period' },
    { label: 'OPEN RATE', value: '73.4%', delta: '+4.2%', up: true, sub: 'vs last period' },
    { label: 'REPLY RATE', value: '31.0%', delta: '+1.8%', up: true, sub: 'vs last period' },
    { label: 'AVG. OPENS', value: '2.4', delta: '', up: true, sub: 'per tracked email' },
  ];

  const openSeries = [38, 44, 41, 52, 48, 60, 57, 66, 62, 71, 68, 74, 70, 78];
  const topRecipients = [
    { initials: 'EC', name: 'Elena Castro', rate: 92 },
    { initials: 'AW', name: 'Amelia Wong', rate: 88 },
    { initials: 'MC', name: 'Marcus Chen', rate: 81 },
    { initials: 'DO', name: 'Dara Okonkwo', rate: 74 },
    { initials: 'TR', name: 'Theo Reyes', rate: 66 },
    { initials: 'PN', name: 'Priya Nair', rate: 61 },
    { initials: 'JO', name: 'James Okafor', rate: 57 },
  ];

  const campaigns = [
    { id: 'c1', name: 'Q2 Outreach — Enterprise', status: 'ACTIVE', created: 'Apr 28', step: 2, steps: 4, recipients: 24, openRate: 67, replies: 8 },
    { id: 'c2', name: 'Product Launch Follow-up', status: 'ACTIVE', created: 'May 1', step: 3, steps: 4, recipients: 11, openRate: 54, replies: 3 },
    { id: 'c3', name: 'Re-engagement Wave', status: 'PAUSED', created: 'Apr 15', step: 1, steps: 5, recipients: 38, openRate: 29, replies: 1 },
  ];

  const people = [
    { initials: 'SM', name: 'Sarah Mitchell', email: 'sarah@acmecorp.com', sent: 12, rate: 83, dot: 'g', last: '2 days ago', status: 'ACTIVE' },
    { initials: 'JO', name: 'James Okafor', email: 'james@venturelab.io', sent: 7, rate: 14, dot: 'r', last: '1 week ago', status: 'UNRESPONSIVE' },
    { initials: 'LH', name: 'Lena Hoffmann', email: 'lena@designstudio.de', sent: 4, rate: 75, dot: 'g', last: 'Today', status: 'REPLIED' },
    { initials: 'CR', name: 'Carlos Rivera', email: 'carlos@startupx.co', sent: 9, rate: 44, dot: 'y', last: '3 days ago', status: 'ACTIVE' },
    { initials: 'PN', name: 'Priya Nair', email: 'priya@techbridge.in', sent: 2, rate: 0, dot: 'r', last: '2 weeks ago', status: 'UNRESPONSIVE' },
  ];

  const lists = [
    { id: 'l1', name: 'Enterprise Leads', count: 12, created: 'Apr 20', sent: 148, rate: 71, dot: 'g', last: '2 days ago' },
    { id: 'l2', name: 'Product Beta Users', count: 7, created: 'May 1', sent: 63, rate: 58, dot: 'y', last: 'Today' },
    { id: 'l3', name: 'Re-engagement', count: 18, created: 'Apr 10', sent: 204, rate: 29, dot: 'r', last: '1 week ago' },
  ];

  const accounts = [
    { email: 'john@gmail.com', kind: 'Gmail', primary: true },
    { email: 'work@company.com', kind: 'Gmail', primary: false },
  ];

  const integrations = [
    { key: 'G', name: 'Gmail', desc: 'Send and track from Gmail web', status: 'connected', count: 2 },
    { key: 'O', name: 'Outlook', desc: 'Send and track from Outlook web', status: 'none' },
  ];

  window.PeekdData = {
    avatarColors, emails, notifications, stats, openSeries, topRecipients,
    campaigns, people, lists, accounts, integrations,
  };
})();
