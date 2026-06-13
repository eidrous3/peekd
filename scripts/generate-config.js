const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const out = `// Auto-generated at build time — do not commit. Set Netlify env vars:
// SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
window.PeekdConfig = {
  supabaseUrl: ${JSON.stringify(url)},
  supabasePublishableKey: ${JSON.stringify(key)},
};
`;

fs.writeFileSync(path.join(__dirname, '..', 'config.js'), out);
console.log(url ? 'config.js written (Supabase from Netlify env)' : 'config.js written (empty — set Netlify env vars)');
