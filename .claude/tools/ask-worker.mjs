#!/usr/bin/env node
// ask-worker.mjs — delegate a task to a FREE OpenRouter model (the "worker layer").
// The orchestrator (Claude Code) calls this via Bash, reviews the output, and decides.
//
// Usage:
//   node .claude/tools/ask-worker.mjs --role code "Write a Zod schema for ..."
//   node .claude/tools/ask-worker.mjs --role bulk --file src/server/queries.ts "Summarize every query and its index needs"
//   echo "long prompt" | node .claude/tools/ask-worker.mjs --role reason -
//
// Options:
//   --role <code|reason|bulk|design|general>   picks a fallback chain of free models (default: general)
//   --model <exact-openrouter-id>              overrides the role chain (single model, no fallback)
//   --file <path>                              attach file content as context (repeatable)
//   --system <text>                            system prompt (default: terse senior-engineer worker)
//   --out <path>                               also write the completion to a file
//   --max-tokens <n>                           default 8192
//   prompt as last arg, or "-" / omitted to read stdin
//
// Env: OPENROUTER_API_KEY (required). Free tier: 20 req/min; 50 req/day (1,000/day after a
// one-time $10 credit purchase). Model IDs verified 2026-07 — re-check openrouter.ai/models
// if every model in a chain 404s; free routes churn monthly.

import { readFileSync, writeFileSync } from 'node:fs';

const CHAINS = {
  code: [
    'qwen/qwen3-coder:free',
    'openai/gpt-oss-120b:free',
    'meta-llama/llama-3.3-70b-instruct:free',
  ],
  reason: [
    'openai/gpt-oss-120b:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'meta-llama/llama-3.3-70b-instruct:free',
  ],
  bulk: [
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'qwen/qwen3-coder:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
  ],
  design: [
    'qwen/qwen3-coder:free',
    'google/gemma-4-31b-it:free',
    'openai/gpt-oss-120b:free',
  ],
  general: [
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'openai/gpt-oss-20b:free',
  ],
};

const DEFAULT_SYSTEM =
  'You are a senior engineer acting as a worker for an orchestrating agent. ' +
  'Do exactly the task given. Be complete but terse: no preamble, no restating the task, ' +
  'no closing summary. Code in fenced blocks with the file path as the info string. ' +
  'If the task is ambiguous or you lack needed context, say PRECISELY what is missing instead of guessing.';

function parseArgs(argv) {
  const opts = { role: 'general', model: null, files: [], system: DEFAULT_SYSTEM, out: null, maxTokens: 8192, prompt: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--role') opts.role = argv[++i];
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '--file') opts.files.push(argv[++i]);
    else if (a === '--system') opts.system = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--max-tokens') opts.maxTokens = Number(argv[++i]) || 8192;
    else if (a === '-' || !a.startsWith('--')) opts.prompt = opts.prompt ? `${opts.prompt} ${a}` : a;
  }
  return opts;
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.trim();
}

async function callModel(model, messages, maxTokens, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/3lawie/Closfa',
        'X-Title': 'closfa-worker',
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content?.trim();
    if (!content) return { error: `empty completion (${JSON.stringify(json).slice(0, 200)})` };
    return { content, usage: json.usage };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timeout after 240s' : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

const opts = parseArgs(process.argv.slice(2));
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('OPENROUTER_API_KEY is not set. Create a key at openrouter.ai/keys and set the env var.');
  process.exit(1);
}

let prompt = opts.prompt && opts.prompt !== '-' ? opts.prompt : await readStdin();
if (!prompt) {
  console.error('No prompt given (pass as argument or on stdin).');
  process.exit(1);
}

for (const f of opts.files) {
  try {
    const body = readFileSync(f, 'utf8');
    prompt += `\n\n<context file="${f}">\n${body}\n</context>`;
  } catch {
    console.error(`warn: could not read --file ${f}, skipping`);
  }
}

const chain = opts.model ? [opts.model] : CHAINS[opts.role] || CHAINS.general;
const messages = [
  { role: 'system', content: opts.system },
  { role: 'user', content: prompt },
];

const failures = [];
for (const model of chain) {
  const result = await callModel(model, messages, opts.maxTokens, apiKey);
  if (result.content) {
    console.error(`[worker: ${model}${result.usage ? ` | tokens: ${result.usage.prompt_tokens}+${result.usage.completion_tokens}` : ''}]`);
    if (opts.out) writeFileSync(opts.out, result.content, 'utf8');
    console.log(result.content);
    process.exit(0);
  }
  failures.push(`${model} -> ${result.error}`);
  console.error(`[worker: ${model} failed (${result.error}), trying next]`);
}

console.error(`All workers failed:\n${failures.join('\n')}\nEither the daily free quota is exhausted, or these free routes were pulled — check openrouter.ai/models and update CHAINS in this script.`);
process.exit(1);
