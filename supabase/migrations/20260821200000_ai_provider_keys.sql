-- Per-user BYOK keys for AI providers. Ciphertext is never selected by the client.

create table if not exists public.ai_provider_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in (
    'mistral', 'grok', 'gemini', 'anthropic', 'openai', 'openai_compatible'
  )),
  key_ciphertext text not null,
  key_last4 text,
  base_url text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_provider_keys_user_provider_key unique (user_id, provider)
);

comment on table public.ai_provider_keys is 'Encrypted customer API keys for Mistral, Grok, Gemini, Anthropic, OpenAI, and OpenAI-compatible endpoints.';
comment on column public.ai_provider_keys.key_ciphertext is 'AES-256-GCM payload — never expose to the browser.';
comment on column public.ai_provider_keys.key_last4 is 'Last four characters of the key, for the Integrations UI.';
comment on column public.ai_provider_keys.base_url is 'Required for openai_compatible; ignored for first-party providers.';

drop trigger if exists ai_provider_keys_set_updated_at on public.ai_provider_keys;
create trigger ai_provider_keys_set_updated_at
  before update on public.ai_provider_keys
  for each row execute function public.set_updated_at();

create index if not exists ai_provider_keys_user_id_idx
  on public.ai_provider_keys (user_id);

alter table public.ai_provider_keys enable row level security;
