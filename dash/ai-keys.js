// Peekd dashboard — customer AI provider keys (BYOK).
(function () {
  const PROVIDERS = [
    { id: 'mistral', name: 'Mistral', desc: 'Use your Mistral API key for AI suggestions', docs: 'https://console.mistral.ai/api-keys' },
    { id: 'grok', name: 'Grok', desc: 'Use your xAI Grok API key', docs: 'https://console.x.ai' },
    { id: 'gemini', name: 'Gemini', desc: 'Use your Google Gemini API key', docs: 'https://aistudio.google.com/apikey' },
    { id: 'anthropic', name: 'Anthropic', desc: 'Use your Anthropic Claude API key', docs: 'https://console.anthropic.com/settings/keys' },
    { id: 'openai', name: 'OpenAI', desc: 'Use your OpenAI API key', docs: 'https://platform.openai.com/api-keys' },
    { id: 'openai_compatible', name: 'OpenAI compatible', desc: 'Any OpenAI-compatible API — Groq, Together, Ollama, and more' },
  ];

  async function authHeader() {
    const session = await window.PeekdAuth?.ensureSession?.();
    const token = session?.access_token;
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }

  async function listKeys() {
    const headers = await authHeader();
    if (!headers) return { ok: false, error: 'no_session' };
    let res;
    try {
      res = await fetch('/.netlify/functions/ai-keys', { headers });
    } catch {
      return { ok: false, error: 'unreachable' };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'list_failed' };
    return { ok: true, keys: data.keys || {} };
  }

  async function saveKey({ provider, apiKey, baseUrl, model }) {
    const headers = await authHeader();
    if (!headers) return { ok: false, error: 'no_session' };
    let res;
    try {
      res = await fetch('/.netlify/functions/ai-keys', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, baseUrl, model }),
      });
    } catch {
      return { ok: false, error: 'unreachable' };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'save_failed' };
    return { ok: true, key: data.key };
  }

  async function removeKey(provider) {
    const headers = await authHeader();
    if (!headers) return { ok: false, error: 'no_session' };
    let res;
    try {
      res = await fetch('/.netlify/functions/ai-keys?provider=' + encodeURIComponent(provider), {
        method: 'DELETE',
        headers,
      });
    } catch {
      return { ok: false, error: 'unreachable' };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'delete_failed' };
    return { ok: true };
  }

  async function generateReply({ messageId, threadId, accountEmail, subject, preview, from, fromEmail } = {}) {
    const headers = await authHeader();
    if (!headers) return { ok: false, error: 'no_session' };
    let res;
    try {
      res = await fetch('/.netlify/functions/ai-reply', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, threadId, accountEmail, subject, preview, from, fromEmail }),
      });
    } catch {
      return { ok: false, error: 'unreachable' };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || 'generate_failed', provider: data.provider };
    return { ok: true, html: data.html || '', text: data.text || '', provider: data.provider };
  }

  function saveErrorMessage(error) {
    if (error === 'no_session') return 'Sign in to save a key';
    if (error === 'pro_required') return 'AI keys are a Pro feature';
    if (error === 'ai_keys_missing') return 'AI keys are not set up yet';
    if (error === 'key_required' || error === 'key_too_short') return 'Enter a valid API key';
    if (error === 'base_url_required' || error === 'base_url_invalid') return 'Enter a valid base URL';
    if (error === 'invalid_provider') return 'Unknown AI provider';
    return 'Could not save the key. Try again.';
  }

  function generateReplyErrorMessage(error, provider) {
    const names = {
      grok: 'Grok',
      gemini: 'Gemini',
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      mistral: 'Mistral',
      openai_compatible: 'your AI provider',
    };
    const name = names[provider] || '';
    if (error === 'no_session' || error === 'Unauthorized' || error === 'Invalid session') return 'Sign in to generate a reply';
    if (error === 'pro_required') return 'Generate reply is a Pro feature';
    if (error === 'no_ai_key' || error === 'ai_keys_missing') return 'Add an AI provider key in Settings → Integrations';
    if (error === 'invalid_ai_key') {
      return name
        ? `The ${name} key was rejected. Check it in Settings → Integrations`
        : 'Your AI key was rejected. Check it in Settings → Integrations';
    }
    if (error === 'llm_quota') {
      return name
        ? `${name} hit a rate or quota limit. Try again shortly`
        : 'The AI provider hit a rate or quota limit. Try again shortly';
    }
    if (error === 'llm_model' || error === 'llm_failed' || error === 'empty_reply') {
      return name
        ? `${name} could not draft a reply. Try another ${name} key or a different provider`
        : 'The AI provider could not draft a reply. Try another key or model';
    }
    if (error === 'no_connected_account' || error === 'token_refresh_failed') {
      return 'Reconnect this mailbox in Settings → Integrations';
    }
    if (error === 'thread_unavailable') return 'Could not read this email thread. Try again';
    if (error === 'keys_not_configured') return 'AI replies are not set up on the server yet';
    if (error === 'provider_url_missing') return 'OpenAI compatible keys need a base URL';
    if (error === 'unreachable' || error === 'generate_failed') {
      return 'Could not reach the reply service. Try again in a moment';
    }
    return 'Could not generate a reply. Try again.';
  }

  window.PeekdAiKeys = { PROVIDERS, listKeys, saveKey, removeKey, generateReply, saveErrorMessage, generateReplyErrorMessage };
})();
