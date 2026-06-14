const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const out = `// Auto-generated at build time — do not commit.
// Netlify env vars:
//   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY  — auth
//   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) — signup existing-user check
//   RESEND_FROM_EMAIL                       — sender address (e.g. noreply@mail.yourdomain.com)
window.PeekdConfig = {
  supabaseUrl: ${JSON.stringify(url)},
  supabasePublishableKey: ${JSON.stringify(key)},
  resendFromEmail: ${JSON.stringify(process.env.RESEND_FROM_EMAIL || '')},
};
`;

fs.writeFileSync(path.join(__dirname, '..', 'config.js'), out);
console.log(url ? 'config.js written (Supabase from Netlify env)' : 'config.js written (empty — set Netlify env vars)');
