import crypto from 'crypto';
import { dbRequest } from './_support.mjs';

export const AI_PROVIDERS = [
  'mistral',
  'grok',
  'gemini',
  'anthropic',
  'openai',
  'openai_compatible',
];

function keyMaterial() {
  const secret = String(process.env.AI_KEYS_SECRET || '').trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || '';
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain) {
  const key = keyMaterial();
  if (!key) return { ok: false, error: 'keys_not_configured' };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ok: true, ciphertext: Buffer.concat([iv, tag, enc]).toString('base64') };
}

export function decryptSecret(payload) {
  const key = keyMaterial();
  if (!key) return { ok: false, error: 'keys_not_configured' };
  try {
    const buf = Buffer.from(String(payload || ''), 'base64');
    if (buf.length < 29) return { ok: false, error: 'invalid_ciphertext' };
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    return { ok: true, secret: plain };
  } catch {
    return { ok: false, error: 'decrypt_failed' };
  }
}

export function last4(value) {
  const chars = String(value || '').replace(/\s+/g, '');
  if (chars.length < 4) return chars;
  return chars.slice(-4);
}

export function publicRow(row) {
  if (!row) return { configured: false };
  return {
    configured: true,
    last4: row.key_last4 || '',
    baseUrl: row.base_url || '',
    model: row.model || '',
  };
}

export async function listAiKeys(userId) {
  const res = await dbRequest(
    `ai_provider_keys?user_id=eq.${encodeURIComponent(userId)}&select=provider,key_last4,base_url,model`,
  );
  if (!res.ok) {
    if (/schema cache|relation .*ai_provider_keys|column .*ai_provider_keys/i.test(res.error || '')) {
      return { ok: false, error: 'ai_keys_missing' };
    }
    return { ok: false, error: res.error || 'list_failed' };
  }
  const keys = {};
  for (const id of AI_PROVIDERS) keys[id] = { configured: false };
  for (const row of res.data || []) {
    if (AI_PROVIDERS.includes(row.provider)) keys[row.provider] = publicRow(row);
  }
  return { ok: true, keys };
}

export async function upsertAiKey(userId, { provider, apiKey, baseUrl, model } = {}) {
  if (!AI_PROVIDERS.includes(provider)) return { ok: false, error: 'invalid_provider' };

  const existing = await dbRequest(
    `ai_provider_keys?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}&select=id,key_ciphertext,key_last4,base_url,model&limit=1`,
  );
  if (!existing.ok) {
    if (/schema cache|relation .*ai_provider_keys/i.test(existing.error || '')) {
      return { ok: false, error: 'ai_keys_missing' };
    }
    return { ok: false, error: existing.error || 'lookup_failed' };
  }
  const row = Array.isArray(existing.data) ? existing.data[0] : null;
  const nextKey = String(apiKey || '').trim();
  if (!nextKey && !row) return { ok: false, error: 'key_required' };

  let ciphertext = row?.key_ciphertext || '';
  let suffix = row?.key_last4 || '';
  if (nextKey) {
    if (nextKey.length < 8) return { ok: false, error: 'key_too_short' };
    const enc = encryptSecret(nextKey);
    if (!enc.ok) return enc;
    ciphertext = enc.ciphertext;
    suffix = last4(nextKey);
  }

  let url = row?.base_url || '';
  let modelName = row?.model || '';
  if (provider === 'openai_compatible') {
    if (baseUrl !== undefined) {
      url = String(baseUrl || '').trim().replace(/\/+$/, '');
    }
    if (!url) return { ok: false, error: 'base_url_required' };
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { ok: false, error: 'base_url_invalid' };
      }
    } catch {
      return { ok: false, error: 'base_url_invalid' };
    }
    if (model !== undefined) modelName = String(model || '').trim().slice(0, 120);
  } else {
    url = '';
    modelName = '';
  }

  const body = {
    user_id: userId,
    provider,
    key_ciphertext: ciphertext,
    key_last4: suffix,
    base_url: url || null,
    model: modelName || null,
  };

  const saved = await dbRequest('ai_provider_keys?on_conflict=user_id,provider', {
    method: 'POST',
    body,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  if (!saved.ok) return { ok: false, error: saved.error || 'save_failed' };
  const savedRow = Array.isArray(saved.data) ? saved.data[0] : saved.data;
  return { ok: true, key: publicRow(savedRow) };
}

export async function deleteAiKey(userId, provider) {
  if (!AI_PROVIDERS.includes(provider)) return { ok: false, error: 'invalid_provider' };
  const res = await dbRequest(
    `ai_provider_keys?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`,
    { method: 'DELETE', prefer: 'return=minimal' },
  );
  if (!res.ok) {
    if (/schema cache|relation .*ai_provider_keys/i.test(res.error || '')) {
      return { ok: false, error: 'ai_keys_missing' };
    }
    return { ok: false, error: res.error || 'delete_failed' };
  }
  return { ok: true };
}
