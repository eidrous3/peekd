import { dbRequest } from './_support.mjs';

export function normalizeCouponCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export async function redeemCoupon(userId, rawCode) {
  const id = String(userId || '').trim();
  const code = normalizeCouponCode(rawCode);
  if (!id) return { ok: false, error: 'user_required' };
  if (!/^[A-Z0-9][A-Z0-9_-]{4,31}$/.test(code)) return { ok: false, error: 'invalid_code' };

  const profileRes = await dbRequest(
    `profiles?id=eq.${encodeURIComponent(id)}&select=id,plan`,
  );
  const profile = Array.isArray(profileRes.data) ? profileRes.data[0] : null;
  if (profile?.plan === 'lifetime') return { ok: false, error: 'already_lifetime' };

  const claimed = await dbRequest(
    `coupons?code=eq.${encodeURIComponent(code)}&redeemed_at=is.null`,
    {
      method: 'PATCH',
      body: {
        redeemed_at: new Date().toISOString(),
        redeemed_by: id,
      },
      prefer: 'return=representation',
    },
  );
  const row = Array.isArray(claimed.data) ? claimed.data[0] : null;
  if (!claimed.ok || !row) {
    if (/schema cache|relation .*coupons/i.test(claimed.error || '')) {
      return { ok: false, error: 'coupons_missing' };
    }
    const exists = await dbRequest(
      `coupons?code=eq.${encodeURIComponent(code)}&select=id,redeemed_at`,
    );
    const found = Array.isArray(exists.data) ? exists.data[0] : null;
    if (found) return { ok: false, error: 'already_used' };
    return { ok: false, error: 'invalid_code' };
  }

  const granted = await dbRequest(
    `profiles?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', body: { plan: 'lifetime' }, prefer: 'return=minimal' },
  );
  if (!granted.ok) {
    await dbRequest(
      `coupons?id=eq.${encodeURIComponent(row.id)}`,
      { method: 'PATCH', body: { redeemed_at: null, redeemed_by: null }, prefer: 'return=minimal' },
    );
    return { ok: false, error: granted.error || 'grant_failed' };
  }

  return { ok: true, plan: 'lifetime' };
}
