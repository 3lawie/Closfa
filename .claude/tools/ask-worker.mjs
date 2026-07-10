#!/usr/bin/env node
// ask-worker.mjs — delegate a task to FREE model providers (the "worker layer").
// The orchestrator (Claude Code) calls this via Bash, reviews the output, and decides.
//
// MULTI-PROVIDER: OpenRouter's free routes are often congested (429). So each role falls
// through several providers that each have their OWN free quota — Groq, Cerebras, Google
// AI Studio, OpenRouter — using whichever has capacity. All expose OpenAI-compatible
// endpoints, so the request shape is identical. Providers with no key set are skipped,
// so this works with just one key today and gets more resilient as you add more.
//
// Usage:
//   node .claude/tools/ask-worker.mjs --role code "Write a Zod schema for ..."
//   node .claude/tools/ask-worker.mjs --role bulk --file src/server/queries.ts "Summarize each query + index needs"
//   echo "long prompt" | node .claude/tools/ask-worker.mjs --role reason -
//
// Options:
//   --role <code|reason|bulk|design|general>   cross-provider fallback chain (default: general)
//   --provider <groq|cerebras|openrouter|gemini>  restrict to one provider
//   --model <provider:model-id>                one exact target, no fallback (e.g. groq:llama-3.3-70b-versatile)
//   --file <path>                              attach file content as context (repeatable)
//   --system <text>                            system prompt (default: terse senior-engineer worker)
//   --out <path>                               also write the completion to a file
//   --max-tokens <n>                           default 8192
//   --retries <n>                              per-endpoint retry attempts (default 5)
//   --sweeps <n>                               full-chain passes before giving up (default 2)
//   prompt as last arg, or "-" / omitted to read stdin
//
// Keys (set any you have; the chain skips providers whose key is missing):
//   GROQ_API_KEY        console.groq.com/keys        ~14,400 req/day, fastest
//   CEREBRAS_API_KEY    cloud.cerebras.ai            ~1M tokens/day, high throughput
//   OPENROUTER_API_KEY  openrouter.ai/keys           widest model variety; 50/day (1,000 after $10 top-up)
//   GEMINI_API_KEY      aistudio.google.com/apikey   1,500 req/day, 1M context, multimodal
//
// Retry model: free calls cost nothing and failures are mostly transient 429s, so each
// endpoint is retried with exponential backoff + jitter (honoring Retry-After) before
// falling to the next; the whole chain is then swept again. Fatal errors (401/400/404)
// skip ahead immediately. Model IDs verified 2026-07 — re-check provider docs if all 404.

import { readFileSync, writeFileSync } from 'node:fs';

// --- Providers (all OpenAI-compatible chat/completions endpoints) ---
const PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY',
  },
  cerebras: {
    url: 'https://api.cerebras.ai/v1/chat/completions',
    keyEnv: 'CEREBRAS_API_KEY',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: 'OPENROUTER_API_KEY',
    headers: { 'HTTP-Referer': 'https://github.com/3lawie/Closfa', 'X-Title': 'closfa-worker' },
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    keyEnv: 'GEMINI_API_KEY',
  },
};

// --- Role → cross-provider fallback chains. "provider:model-id".
// Dedicated-capacity providers (Groq, Cerebras) go first; OpenRouter adds breadth. ---
// Model IDs verified live against provider /models endpoints 2026-07-11. Re-query when a
// role starts 404ing — see .claude/skills/delegate/references/provider-models.md.
const CHAINS = {
  code: [
    'groq:openai/gpt-oss-120b',
    'cerebras:gpt-oss-120b',
    'openrouter:qwen/qwen3-coder:free',
    'groq:qwen/qwen3.6-27b',
  ],
  reason: [
    'cerebras:zai-glm-4.7',
    'groq:openai/gpt-oss-120b',
    'groq:qwen/qwen3-32b',
    'openrouter:openai/gpt-oss-120b:free',
  ],
  bulk: [
    'cerebras:gpt-oss-120b',
    'groq:openai/gpt-oss-120b',
    'openrouter:nvidia/nemotron-3-ultra-550b-a55b:free',
    'groq:llama-3.3-70b-versatile',
  ],
  design: [
    'groq:qwen/qwen3.6-27b',
    'cerebras:gemma-4-31b',
    'openrouter:qwen/qwen3-coder:free',
    'groq:openai/gpt-oss-120b',
  ],
  general: [
    'groq:openai/gpt-oss-120b',
    'cerebras:gpt-oss-120b',
    'groq:llama-3.3-70b-versatile',
    'openrouter:qwen/qwen3-next-80b-a3b-instruct:free',
  ],
};

const DEFAULT_SYSTEM =
  'You are a senior engineer acting as a worker for an orchestrating agent. ' +
  'Do exactly the task given. Be complete but terse: no preamble, no restating the task, ' +
  'no closing summary. Code in fenced blocks with the file path as the info string. ' +
  'If the task is ambiguous or you lack needed context, say PRECISELY what is missing instead of guessing.';

// Completion marker: the worker is told to end with this exact line so the orchestrator can
// cheaply confirm the response finished (not cut off by max_tokens) without re-reading it all.
const SENTINEL = '<<<WORKER_DONE>>>';
const SENTINEL_NOTE = ` When finished, end your entire response with this exact line and nothing after it: ${SENTINEL}`;

function parseArgs(argv) {
  const opts = {
    role: 'general', model: null, provider: null, files: [], system: DEFAULT_SYSTEM, out: null,
    maxTokens: 8192, prompt: null, retries: 5, backoffBaseMs: 1500, backoffCapMs: 20000, sweeps: 2,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--role') opts.role = argv[++i];
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '--provider') opts.provider = argv[++i];
    else if (a === '--file') opts.files.push(argv[++i]);
    else if (a === '--system') opts.system = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--max-tokens') opts.maxTokens = Number(argv[++i]) || 8192;
    else if (a === '--retries') opts.retries = Number(argv[++i]) || 5;
    else if (a === '--sweeps') opts.sweeps = Number(argv[++i]) || 2;
    else if (a === '-' || !a.startsWith('--')) opts.prompt = opts.prompt ? `${opts.prompt} ${a}` : a;
  }
  return opts;
}

// "provider:model-id" — split on the FIRST colon only (model ids contain ':' and '/').
function parseTarget(entry) {
  const i = entry.indexOf(':');
  return { provider: entry.slice(0, i), model: entry.slice(i + 1) };
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.trim();
}

// Collect ALL keys for a provider: KEY, KEYS (comma/space/newline list), and KEY_2..KEY_20.
// Lets you fire many requests by rotating keys (esp. OpenRouter — different keys/accounts
// have independent rate limits, so N keys ≈ N× the free throughput).
function getKeys(cfg) {
  const keys = [];
  if (process.env[cfg.keyEnv]) keys.push(process.env[cfg.keyEnv]);
  if (process.env[`${cfg.keyEnv}S`]) keys.push(...process.env[`${cfg.keyEnv}S`].split(/[\s,]+/).filter(Boolean));
  for (let i = 2; i <= 20; i++) if (process.env[`${cfg.keyEnv}_${i}`]) keys.push(process.env[`${cfg.keyEnv}_${i}`]);
  return [...new Set(keys)];
}

async function callEndpoint(provider, model, messages, maxTokens, key) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return { error: `unknown provider "${provider}"`, retryable: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(cfg.headers || {}) },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const retryable = res.status === 429 || res.status === 408 || res.status >= 500;
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      return { error: `HTTP ${res.status}: ${body.slice(0, 160)}`, status: res.status, retryable, retryAfter };
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content?.trim();
    if (!content) return { error: `empty completion (${JSON.stringify(json).slice(0, 160)})`, retryable: true };
    return { content, usage: json.usage };
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'request timeout' : String(e.message || e);
    return { error: msg, retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry ONE endpoint with exponential backoff + jitter until it answers, the error is
// fatal, or the attempt cap is hit. Honors Retry-After. Free calls cost nothing, so
// retrying a rejected call beats skipping to a weaker model — the only spend is networking.
async function callWithRetry(provider, model, messages, opts) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return { error: `unknown provider "${provider}"`, retryable: false, attempts: 0 };
  const keys = getKeys(cfg);
  if (keys.length === 0) return { error: `no key (${cfg.keyEnv} unset)`, noKey: true, attempts: 0 };
  let attempt = 0;
  let lastError = 'unknown';
  while (attempt < opts.retries) {
    const key = keys[attempt % keys.length]; // rotate keys across attempts
    const result = await callEndpoint(provider, model, messages, opts.maxTokens, key);
    if (result.content) return { ...result, attempts: attempt + 1 };
    lastError = result.error;
    attempt++;
    if (result.retryable === false) break;
    if (attempt >= opts.retries) break;
    // If an unused key remains this cycle, rotate to it almost immediately; only back off
    // (growing per full cycle through all keys) once every key has been tried this round.
    const rotating = keys.length > 1 && attempt % keys.length !== 0;
    const round = Math.floor(attempt / keys.length);
    const backoff = Math.min(opts.backoffCapMs, opts.backoffBaseMs * 2 ** round);
    const jitter = Math.floor(Math.random() * opts.backoffBaseMs);
    const wait = rotating ? 400 + jitter : Math.max((result.retryAfter || 0) * 1000, backoff + jitter);
    const keyTag = keys.length > 1 ? ` key ${(attempt % keys.length) + 1}/${keys.length}` : '';
    console.error(`[${provider}:${model} attempt ${attempt}/${opts.retries}${keyTag} failed (${result.error}); retry in ${Math.round(wait / 1000)}s]`);
    await sleep(wait);
  }
  return { error: lastError, attempts: attempt };
}

// --- main ---
const opts = parseArgs(process.argv.slice(2));

let prompt = opts.prompt && opts.prompt !== '-' ? opts.prompt : await readStdin();
if (!prompt) {
  console.error('No prompt given (pass as argument or on stdin).');
  process.exit(1);
}
for (const f of opts.files) {
  try {
    prompt += `\n\n<context file="${f}">\n${readFileSync(f, 'utf8')}\n</context>`;
  } catch {
    console.error(`warn: could not read --file ${f}, skipping`);
  }
}

let chain = opts.model ? [opts.model] : CHAINS[opts.role] || CHAINS.general;
if (opts.provider) chain = chain.filter((e) => e.startsWith(`${opts.provider}:`));
if (chain.length === 0) {
  console.error(`No endpoints for provider "${opts.provider}" in role "${opts.role}".`);
  process.exit(1);
}

// Warn once about which providers are usable given the keys present.
const haveKeys = Object.entries(PROVIDERS).filter(([, c]) => getKeys(c).length > 0).map(([n]) => n);
if (haveKeys.length === 0) {
  console.error('No provider keys set. Set at least one of: GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY.');
  process.exit(1);
}
console.error(`[worker: keys present → ${haveKeys.join(', ')}]`);

const messages = [
  { role: 'system', content: opts.system + SENTINEL_NOTE },
  { role: 'user', content: prompt },
];

const failures = [];
for (let sweep = 1; sweep <= opts.sweeps; sweep++) {
  for (const entry of chain) {
    const { provider, model } = parseTarget(entry);
    const result = await callWithRetry(provider, model, messages, opts);
    if (result.content) {
      const done = result.content.includes(SENTINEL);
      const out = result.content.replace(SENTINEL, '').trimEnd();
      const tk = result.usage ? ` | tokens: ${result.usage.prompt_tokens ?? '?'}+${result.usage.completion_tokens ?? '?'}` : '';
      const warn = done ? '' : ' | ⚠ no completion marker — output may be truncated, raise --max-tokens or re-brief shorter';
      console.error(`[worker: ${provider}:${model} | sweep ${sweep} | attempt ${result.attempts}${tk}${warn}]`);
      if (opts.out) writeFileSync(opts.out, out, 'utf8');
      console.log(out);
      process.exit(0);
    }
    if (result.noKey) {
      console.error(`[skip ${provider}:${model} — ${result.error}]`);
      continue;
    }
    failures.push(`sweep ${sweep} · ${provider}:${model} -> ${result.error}`);
  }
  if (sweep < opts.sweeps) {
    console.error(`[worker: full chain exhausted, sweep ${sweep + 1}/${opts.sweeps} after brief pause]`);
    await sleep(opts.backoffCapMs);
  }
}

console.error(
  `All workers failed after ${opts.retries} retries × ${opts.sweeps} sweeps:\n${failures.slice(-chain.length).join('\n')}\n` +
  `Add more provider keys (Groq/Cerebras/Gemini each have separate free quota), or the daily quota is exhausted / a route was pulled — check the provider dashboards.`
);
process.exit(1);
