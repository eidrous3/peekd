const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  grok: 'grok-3-mini',
  mistral: 'mistral-small-latest',
  anthropic: 'claude-3-5-sonnet-latest',
  gemini: 'gemini-2.0-flash',
  openai_compatible: 'gpt-4o-mini',
};

const MODEL_FALLBACKS = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  grok: ['grok-3-mini', 'grok-2-latest', 'grok-2-1212', 'grok-3'],
  mistral: ['mistral-small-latest', 'mistral-small-2409', 'open-mistral-nemo'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-haiku-20240307'],
  gemini: ['gemini-2.0-flash', 'gemini-flash-latest', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'],
  openai_compatible: [],
};

function chatUrl(provider, baseUrl) {
  if (provider === 'openai') return 'https://api.openai.com/v1';
  if (provider === 'grok') return 'https://api.x.ai/v1';
  if (provider === 'mistral') return 'https://api.mistral.ai/v1';
  if (provider === 'openai_compatible') return String(baseUrl || '').replace(/\/+$/, '');
  return '';
}

function systemPrompt() {
  return [
    'You write email replies for the account owner.',
    'Read the thread and draft a concise, professional reply in their voice.',
    'Do not include a subject line, placeholder names like [Name], or quoted original text.',
    'Do not mention that you are an AI. Return only the reply body as plain text paragraphs.',
  ].join(' ');
}

function threadPrompt(messages) {
  const lines = (messages || []).map((msg, i) => {
    const who = msg.from || 'Unknown';
    const when = msg.date ? ` (${msg.date})` : '';
    return `Message ${i + 1} from ${who}${when}:\n${msg.text}`;
  });
  return `Email thread, oldest first:\n\n${lines.join('\n\n---\n\n')}\n\nWrite the reply now.`;
}

function classifyLlmError(status, message) {
  const msg = String(message || '');
  const lower = msg.toLowerCase();
  if (status === 401 || status === 403
    || /invalid api key|incorrect api key|unauthorized|authentication|permission/i.test(lower)) {
    return 'invalid_ai_key';
  }
  if (status === 429 || /quota|rate limit|insufficient_quota/i.test(lower)) return 'llm_quota';
  if (/model/i.test(lower) && /not found|does not exist|unknown|invalid/i.test(lower)) return 'llm_model';
  return 'llm_failed';
}

async function openaiChat(url, apiKey, { model, messages }) {
  let res;
  try {
    res = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 700,
        messages,
      }),
    });
  } catch {
    return { ok: false, error: 'llm_failed' };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: classifyLlmError(res.status, data.error?.message || data.message) };
  }
  const text = String(data.choices?.[0]?.message?.content || '').trim();
  if (!text) return { ok: false, error: 'empty_reply' };
  return { ok: true, text };
}

async function anthropicChat(apiKey, { model, prompt }) {
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        system: systemPrompt(),
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch {
    return { ok: false, error: 'llm_failed' };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: classifyLlmError(res.status, data.error?.message || data.message) };
  }
  const text = String(data.content?.[0]?.text || '').trim();
  if (!text) return { ok: false, error: 'empty_reply' };
  return { ok: true, text };
}

async function geminiChat(apiKey, { model, prompt }) {
  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt() }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
        }),
      },
    );
  } catch {
    return { ok: false, error: 'llm_failed' };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: classifyLlmError(res.status, data.error?.message) };
  }
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || '').join('').trim();
  if (!text) return { ok: false, error: 'empty_reply' };
  return { ok: true, text };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function textToHtml(text) {
  const blocks = String(text || '').trim().split(/\n\s*\n/);
  if (!blocks.length || (blocks.length === 1 && !blocks[0])) return '<p><br></p>';
  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function modelsFor(key) {
  const preferred = String(key.model || '').trim();
  const fallbacks = MODEL_FALLBACKS[key.provider] || [];
  const defaults = [preferred, DEFAULT_MODELS[key.provider], ...fallbacks].filter(Boolean);
  return [...new Set(defaults)];
}

async function callProvider(key, model, { prompt, chatMessages }) {
  if (key.provider === 'anthropic') {
    return anthropicChat(key.apiKey, { model, prompt });
  }
  if (key.provider === 'gemini') {
    return geminiChat(key.apiKey, { model, prompt });
  }
  const url = chatUrl(key.provider, key.baseUrl);
  if (!url) return { ok: false, error: 'provider_url_missing' };
  return openaiChat(url, key.apiKey, { model, messages: chatMessages });
}

export async function generateReplyText(key, messages) {
  const prompt = threadPrompt(messages);
  const chatMessages = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: prompt },
  ];

  let last = { ok: false, error: 'llm_failed' };
  for (const model of modelsFor(key)) {
    last = await callProvider(key, model, { prompt, chatMessages });
    if (last.ok) return last;
    if (last.error !== 'llm_model') return last;
  }
  return last;
}
