import { dbRequest } from './_support.mjs';

export const DEFAULT_BILLING_METHODS = {
  coupons: true,
  paddle: true,
  stripe: false,
};

function normalizeMethods(row) {
  if (!row) return { ...DEFAULT_BILLING_METHODS };
  return {
    coupons: row.coupons_enabled !== false,
    paddle: row.paddle_enabled !== false,
    stripe: row.stripe_enabled === true,
  };
}

export async function getBillingMethods() {
  const res = await dbRequest(
    'billing_settings?id=eq.1&select=coupons_enabled,paddle_enabled,stripe_enabled&limit=1',
  );
  if (!res.ok) {
    if (/schema cache|relation .*billing_settings/i.test(res.error || '')) {
      return { ok: true, methods: { ...DEFAULT_BILLING_METHODS }, missing: true };
    }
    return { ok: false, error: res.error || 'settings_failed' };
  }
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return { ok: true, methods: normalizeMethods(row) };
}

export async function setBillingMethods(partial = {}) {
  const current = await getBillingMethods();
  if (!current.ok) return current;
  if (current.missing) return { ok: false, error: 'billing_settings_missing' };

  const next = {
    ...current.methods,
    ...Object.fromEntries(
      Object.entries(partial).filter(([, value]) => typeof value === 'boolean'),
    ),
  };

  const upsert = await dbRequest('billing_settings?on_conflict=id', {
    method: 'POST',
    body: {
      id: 1,
      coupons_enabled: !!next.coupons,
      paddle_enabled: !!next.paddle,
      stripe_enabled: !!next.stripe,
    },
    prefer: 'resolution=merge-duplicates,return=representation',
  });

  if (!upsert.ok) return { ok: false, error: upsert.error || 'update_failed' };
  const row = Array.isArray(upsert.data) ? upsert.data[0] : upsert.data;
  return { ok: true, methods: normalizeMethods(row) };
}
