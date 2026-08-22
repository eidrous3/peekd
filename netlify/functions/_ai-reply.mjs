const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  grok: 'grok-3-mini',
  mistral: 'mistral-small-latest',
  anthropic: 'claude-3-5-sonnet-latest',
  gemini: 'gemini-2.0-flash',
  openai_compatible: 'gpt-4o-mini',
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

async function openaiChat(url, apiKey, { model, messages }) {
  const res = await fetch(`${url}/chat/completions`, {
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error?.message || data.message || 'llm_failed' };
  }
  const text = String(data.choices?.[0]?.message?.content || '').trim();
  if (!text) return { ok: false, error: 'empty_reply' };
  return { ok: true, text };
}

async function anthropicChat(apiKey, { model, prompt }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error?.message || data.message || 'llm_failed' };
  }
  const text = String(data.content?.[0]?.text || '').trim();
  if (!text) return { ok: false, error: 'empty_reply' };
  return { ok: true, text };
}

async function geminiChat(apiKey, { model, prompt }) {
  const res = await fetch(
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error?.message || 'llm_failed' };
  }
  const text = String(data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
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

export async function generateReplyText(key, messages) {
  const model = key.model || DEFAULT_MODELS[key.provider] || DEFAULT_MODELS.openai;
  const prompt = threadPrompt(messages);
  const chatMessages = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: prompt },
  ];

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
