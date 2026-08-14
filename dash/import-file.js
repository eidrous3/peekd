// Reads a .csv/.xlsx contact file into { email, firstName, lastName, company } rows.
(function () {
  const HEADERS = {
    email: ['email', 'email address', 'e mail', 'e mail address', 'mail', 'work email'],
    first: ['first name', 'firstname', 'first', 'given name', 'forename'],
    last: ['last name', 'lastname', 'last', 'surname', 'family name'],
    name: ['name', 'full name', 'fullname', 'contact', 'contact name', 'display name'],
    company: ['company', 'company name', 'organization', 'organisation', 'employer', 'account'],
  };

  const MAX_ROWS = 5000;

  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
  }

  function normalizeKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ');
  }

  function pickDelimiter(text) {
    const line = String(text || '').split(/\r?\n/).find((l) => l.trim()) || '';
    const counts = [[',', 0], [';', 0], ['\t', 0]];
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      if (quoted) continue;
      const hit = counts.find(([d]) => d === ch);
      if (hit) hit[1] += 1;
    }
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ',';
  }

  // Quoted fields, doubled quotes, and newlines inside quotes.
  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const src = String(text || '').replace(/^\uFEFF/, '');

    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"') {
          if (src[i + 1] === '"') { field += '"'; i += 1; }
          else quoted = false;
        } else field += ch;
        continue;
      }
      if (ch === '"') { quoted = true; continue; }
      if (ch === delimiter) { row.push(field); field = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += ch;
    }
    row.push(field);
    rows.push(row);

    return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
  }

  function headerMap(row) {
    const map = {};
    row.forEach((cell, i) => {
      const key = normalizeKey(cell);
      for (const [field, aliases] of Object.entries(HEADERS)) {
        if (map[field] === undefined && aliases.includes(key)) map[field] = i;
      }
    });
    return map;
  }

  function splitName(value) {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  function cell(row, i) {
    return i === undefined || i < 0 ? '' : String(row[i] ?? '').trim();
  }

  // Without a usable header, fall back to whichever column holds the addresses.
  function emailColumn(rows) {
    const width = Math.max(...rows.map((r) => r.length));
    for (let c = 0; c < width; c += 1) {
      if (rows.some((r) => isEmail(r[c]))) return c;
    }
    return -1;
  }

  function rowsToContacts(rows) {
    if (!rows.length) return { ok: false, error: 'empty_file' };

    const map = headerMap(rows[0]);
    const hasHeader = ['email', 'name', 'first', 'last', 'company'].some((k) => map[k] !== undefined);
    const body = hasHeader ? rows.slice(1) : rows;

    let emailIndex = map.email;
    if (emailIndex === undefined) {
      emailIndex = emailColumn(body);
      if (emailIndex < 0) return { ok: false, error: 'no_email_column' };
    }

    const byEmail = new Map();
    let invalid = 0;
    let duplicates = 0;

    for (const row of body.slice(0, MAX_ROWS)) {
      const email = cell(row, emailIndex).toLowerCase();
      if (!isEmail(email)) { invalid += 1; continue; }
      if (byEmail.has(email)) { duplicates += 1; continue; }

      let firstName = cell(row, map.first);
      let lastName = cell(row, map.last);
      if (!firstName && !lastName && map.name !== undefined) {
        ({ firstName, lastName } = splitName(cell(row, map.name)));
      }

      byEmail.set(email, { email, firstName, lastName, company: cell(row, map.company) });
    }

    const contacts = [...byEmail.values()];
    if (!contacts.length) return { ok: false, error: 'no_valid_rows', invalid };

    return {
      ok: true,
      contacts,
      invalid,
      duplicates,
      truncated: body.length > MAX_ROWS,
    };
  }

  function readAsText(file) {
    if (file.text) return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function readAsArrayBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  async function sheetRows(file) {
    if (!window.XLSX?.read) return { ok: false, error: 'xlsx_unavailable' };
    const buffer = await readAsArrayBuffer(file);
    const book = window.XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const sheet = book.Sheets[book.SheetNames[0]];
    if (!sheet) return { ok: false, error: 'empty_file' };
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    return { ok: true, rows: rows.filter((r) => r.some((c) => String(c).trim() !== '')) };
  }

  async function parseContactsFile(file) {
    if (!file) return { ok: false, error: 'no_file' };
    const ext = String(file.name || '').split('.').pop().toLowerCase();

    try {
      if (ext === 'xlsx' || ext === 'xls') {
        const res = await sheetRows(file);
        if (!res.ok) return res;
        return rowsToContacts(res.rows);
      }
      if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        const text = await readAsText(file);
        return rowsToContacts(parseDelimited(text, pickDelimiter(text)));
      }
      return { ok: false, error: 'unsupported_type' };
    } catch (err) {
      console.warn('[Peekd] Could not read import file', err);
      return { ok: false, error: 'unreadable' };
    }
  }

  function importErrorMessage(error) {
    if (error === 'empty_file') return 'That file looks empty.';
    if (error === 'no_email_column') return 'No email column found. Add an "email" header.';
    if (error === 'no_valid_rows') return 'No valid email addresses in that file.';
    if (error === 'unsupported_type') return 'Upload a .csv or .xlsx file.';
    if (error === 'xlsx_unavailable') return 'Spreadsheet support failed to load. Try a .csv file.';
    return 'Could not read that file.';
  }

  window.PeekdImport = { parseContactsFile, importErrorMessage, parseDelimited, rowsToContacts };
})();
