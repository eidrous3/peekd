const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const paddleToken = process.env.PADDLE_CLIENT_TOKEN || '';
const paddlePriceId = process.env.PADDLE_PRICE_ID || '';
const paddleSandboxFlag = String(process.env.PADDLE_SANDBOX || '').trim().toLowerCase();
const paddleSandbox = paddleSandboxFlag === '1'
  || paddleSandboxFlag === 'true'
  || paddleSandboxFlag === 'sandbox'
  || paddleToken.startsWith('test_');
const stripePriceId = process.env.STRIPE_PRICE_ID || '';
const paypalPlanId = process.env.PAYPAL_PLAN_ID || '';
const paypalAnnualPlanId = process.env.PAYPAL_ANNUAL_PLAN_ID || '';
const paypalTestPlanId = process.env.PAYPAL_TEST_PLAN_ID || '';

const out = `// Auto-generated at build time — do not commit.
// Netlify env vars:
//   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY  — auth
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET       — Gmail OAuth
//   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) — signup existing-user check, delete account, Gmail callback, support admin
//   SUPPORT_ADMIN_EMAIL, SUPPORT_ADMIN_PASSWORD, SUPPORT_ADMIN_SECRET — support ticket admin login
//   RESEND_API_KEY, RESEND_FROM_EMAIL       — support ticket + transactional email (Resend)
//   PADDLE_CLIENT_TOKEN, PADDLE_PRICE_ID, PADDLE_SANDBOX — overlay checkout (public)
//   PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET — billing webhook + customer portal (secret)
//   STRIPE_PRICE_ID — hosted Checkout (public flag)
//   STRIPE_SECRET_KEY or STRIPE_RESTRICTED_KEY, STRIPE_WEBHOOK_SECRET — Checkout + webhook (secret)
//   PAYPAL_PLAN_ID — monthly PayPal plan (public flag)
//   PAYPAL_ANNUAL_PLAN_ID — annual PayPal plan (public flag)
//   PAYPAL_TEST_PLAN_ID — $0.01 developer test plan (public flag; checkout still gated)
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_SANDBOX — PayPal checkout + webhook (secret)
//   AI_KEYS_SECRET — optional; encrypts customer AI API keys (falls back to the service role key)
window.PeekdConfig = {
  supabaseUrl: ${JSON.stringify(url)},
  supabasePublishableKey: ${JSON.stringify(key)},
  resendFromEmail: ${JSON.stringify(process.env.RESEND_FROM_EMAIL || '')},
  paddleClientToken: ${JSON.stringify(paddleToken)},
  paddlePriceId: ${JSON.stringify(paddlePriceId)},
  paddleSandbox: ${paddleSandbox},
  stripePriceId: ${JSON.stringify(stripePriceId)},
  paypalPlanId: ${JSON.stringify(paypalPlanId)},
  paypalAnnualPlanId: ${JSON.stringify(paypalAnnualPlanId)},
  paypalTestPlanId: ${JSON.stringify(paypalTestPlanId)},
};
`;

fs.writeFileSync(path.join(__dirname, '..', 'config.js'), out);
console.log(url ? 'config.js written (Supabase from Netlify env)' : 'config.js written (empty — set Netlify env vars)');
