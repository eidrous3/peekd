const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  grok: 'grok-4.6',
  mistral: 'mistral-small-latest',
  anthropic: 'claude-haiku-4-5',
  gemini: 'gemini-2.5-flash',
  openai_compatible: 'gpt-4o-mini',
};

const MODEL_FALLBACKS = {
  openai: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o', 'gpt-5-mini', 'gpt-5'],
  grok: ['grok-4.6', 'grok-4.5', 'grok-4.3', 'grok-4', 'grok-3-mini', 'grok-3'],
  mistral: ['mistral-small-latest', 'mistral-small-2409', 'ministral-8b-latest', 'open-mistral-nemo'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-3-5-haiku-latest'],
  gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'],
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
  const lower = String(message || '').toLowerCase();
  if (status === 401 || status === 403
    || /invalid api key|incorrect api key|unauthorized|authentication|permission denied/i.test(lower)) {
    return 'invalid_ai_key';
  }
  if (status === 429 || /quota|rate limit|insufficient_quota/i.test(lower)) return 'llm_quota';
  if (status === 404 || (/model/i.test(lower) && /not found|does not exist|unknown|invalid|deprecat/i.test(lower))) {
    return 'llm_model';
  }
  return 'llm_failed';
}

function choiceText(choice) {
  const message = choice?.message || {};
  const content = message.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      return part?.text || part?.content || '';
    }).join('').trim();
  }
  return '';
}

function responsesText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const chunks = [];
  for (const item of data?.output || []) {
    for (const part of item.content || []) {
      if (part?.text) chunks.push(part.text);
    }
  }
  return chunks.join('').trim();
}

async function openaiChatOnce(url, apiKey, body) {
  let res;
  try {
    res = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'llm_failed' };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: classifyLlmError(res.status, data.error?.message || data.message) };
  }
  const text = choiceText(data.choices?.[0]);
  if (!text) return { ok: false, error: 'empty_reply' };
  return { ok: true, text };
}

async function openaiChat(url, apiKey, { model, messages, provider }) {
  const payloads = provider === 'grok'
    ? [
      { model, messages, max_completion_tokens: 800 },
      { model, messages, temperature: 0.4, max_completion_tokens: 800 },
    ]
    : [
      { model, messages, temperature: 0.4, max_completion_tokens: 800 },
      { model, messages, temperature: 0.4, max_tokens: 700 },
    ];

  let last = { ok: false, error: 'llm_failed' };
  for (const body of payloads) {
    last = await openaiChatOnce(url, apiKey, body);
    if (last.ok) return last;
    if (last.error === 'invalid_ai_key' || last.error === 'llm_quota') return last;
  }
  return last;
}

async function grokResponses(apiKey, { model, prompt }) {
  let res;
  try {
    res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: prompt },
        ],
        max_output_tokens: 800,
      }),
    });
  } catch {
    return { ok: false, error: 'llm_failed' };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: classifyLlmError(res.status, data.error?.message || data.message) };
  }
  const text = responsesText(data);
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

async function geminiChatOnce(apiKey, model, body) {
  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
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

async function geminiChat(apiKey, { model, prompt }) {
  const combined = `${systemPrompt()}\n\n${prompt}`;
  const attempts = [
    {
      systemInstruction: { parts: [{ text: systemPrompt() }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
    },
    {
      contents: [{ parts: [{ text: combined }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
    },
  ];
  let last = { ok: false, error: 'llm_failed' };
  for (const body of attempts) {
    last = await geminiChatOnce(apiKey, model, body);
    if (last.ok) return last;
    if (last.error === 'invalid_ai_key' || last.error === 'llm_quota') return last;
  }
  return last;
}

function skipListedModel(id, provider) {
  const s = String(id || '').toLowerCase();
  if (/embed|tts|whisper|moderation|transcri|realtime|image|video|imagine|voice|audio|tts/i.test(s)) return true;
  if (provider === 'gemini' && /native-audio|-live|image|imagen/.test(s)) return true;
  return false;
}

function preferPatterns(provider) {
  if (provider === 'grok') return [/grok-4\.6/, /grok-4\.5/, /grok-4\.3/, /grok-4(?![\d.])/, /grok-3-mini/, /grok-3/, /grok-2/];
  if (provider === 'openai') return [/gpt-4o-mini/, /gpt-4\.1-mini/, /gpt-5-mini/, /gpt-4o/, /gpt-5/, /gpt-4\.1/];
  if (provider === 'mistral') return [/mistral-small/, /ministral/, /open-mistral/, /mistral-medium/];
  if (provider === 'anthropic') return [/claude-haiku-4/, /claude-sonnet-4-6/, /claude-sonnet-4/, /claude-3-5-haiku/, /claude-3-5-sonnet/];
  if (provider === 'gemini') return [/gemini-2\.5-flash-lite/, /gemini-2\.5-flash/, /gemini-2\.0-flash/, /gemini-flash/, /gemini-1\.5-flash/];
  return [];
}

function hardcodedModels(key) {
  const preferred = String(key.model || '').trim();
  const fallbacks = MODEL_FALLBACKS[key.provider] || [];
  return [...new Set([preferred, DEFAULT_MODELS[key.provider], ...fallbacks].filter(Boolean))];
}

async function listProviderModels(key) {
  try {
    if (key.provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key.apiKey)}`,
      );
      const data = await res.json().catch(() => ({}));
      return (data.models || [])
        .filter((row) => (row.supportedGenerationMethods || []).includes('generateContent'))
        .map((row) => String(row.name || '').replace(/^models\//, ''))
        .filter(Boolean);
    }
    if (key.provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models?limit=50', {
        headers: {
          'x-api-key': key.apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      const data = await res.json().catch(() => ({}));
      return (data.data || []).map((row) => row.id).filter(Boolean);
    }
    const url = chatUrl(key.provider, key.baseUrl);
    if (!url) return [];
    const res = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${key.apiKey}` },
    });
    const data = await res.json().catch(() => ({}));
    return (data.data || data.models || []).map((row) => row.id || row.name).filter(Boolean);
  } catch {
    return [];
  }
}

function resolveModels(key, listed) {
  const usable = (listed || []).filter((id) => !skipListedModel(id, key.provider));
  const ordered = [];
  const add = (id) => {
    if (id && !ordered.includes(id)) ordered.push(id);
  };
  for (const id of hardcodedModels(key)) {
    if (!usable.length || usable.includes(id)) add(id);
  }
  for (const pattern of preferPatterns(key.provider)) {
    for (const id of usable) {
      if (pattern.test(id)) add(id);
    }
  }
  for (const id of usable) add(id);
  return ordered.slice(0, 6);
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

async function callProvider(key, model, { prompt, chatMessages }) {
  if (key.provider === 'anthropic') {
    return anthropicChat(key.apiKey, { model, prompt });
  }
  if (key.provider === 'gemini') {
    return geminiChat(key.apiKey, { model, prompt });
  }

  const url = chatUrl(key.provider, key.baseUrl);
  if (!url) return { ok: false, error: 'provider_url_missing' };

  const chat = await openaiChat(url, key.apiKey, {
    model,
    messages: chatMessages,
    provider: key.provider,
  });
  if (chat.ok || key.provider !== 'grok') return chat;
  if (chat.error === 'invalid_ai_key' || chat.error === 'llm_quota') return chat;

  const responses = await grokResponses(key.apiKey, { model, prompt });
  return responses.ok ? responses : chat;
}

export async function generateReplyText(key, messages) {
  const prompt = threadPrompt(messages);
  const chatMessages = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: prompt },
  ];

  const listed = await listProviderModels(key);
  const models = resolveModels(key, listed);
  let last = { ok: false, error: 'llm_failed' };

  for (const model of models) {
    last = await callProvider(key, model, { prompt, chatMessages });
    if (last.ok) return last;
    if (last.error === 'invalid_ai_key' || last.error === 'llm_quota' || last.error === 'provider_url_missing') {
      return last;
    }
  }
  return last;
}
