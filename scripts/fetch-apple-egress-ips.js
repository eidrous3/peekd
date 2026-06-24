const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'netlify/functions/_apple-egress-ips.json');
const URL = 'https://mask-api.icloud.com/egress-ip-ranges.csv';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCsv(text) {
  const lines = String(text || '').trim().split(/\r?\n/);
  const cidrs = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || i === 0 && line.toLowerCase().includes('ip_prefix')) continue;
    const prefix = line.split(',')[0]?.trim();
    if (prefix && prefix.includes('/')) cidrs.push(prefix);
  }
  return [...new Set(cidrs)];
}

async function main() {
  let cidrs = [];
  let fetchedAt = null;

  try {
    const csv = await fetchText(URL);
    cidrs = parseCsv(csv);
    fetchedAt = new Date().toISOString();
    console.log(`Apple egress IPs: ${cidrs.length} CIDR ranges`);
  } catch (err) {
    console.warn('Could not fetch Apple egress IP list:', err.message);
    try {
      const existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
      cidrs = Array.isArray(existing.cidrs) ? existing.cidrs : [];
      fetchedAt = existing.fetchedAt || null;
    } catch {
      cidrs = [];
    }
  }

  fs.writeFileSync(OUT, `${JSON.stringify({ fetchedAt, cidrs }, null, 2)}\n`);
}

main();
