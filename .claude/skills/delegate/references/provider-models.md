# Provider Model Rankings (verified live 2026-07-11)

Free routes churn monthly — re-query the authoritative list anytime:
```
node -e 'fetch("https://api.groq.com/openai/v1/models",{headers:{Authorization:"Bearer "+process.env.GROQ_API_KEY}}).then(r=>r.json()).then(j=>console.log(j.data.map(m=>m.id).join("\n")))'
```
(swap host for `api.cerebras.ai/v1/models` or `openrouter.ai/api/v1/models`.) When a role starts 404ing, a model was pulled — re-query and update `CHAINS` in `ask-worker.mjs`.

## Quick ranking (cost / intelligence / reasoning / taste / speed, 1-10, rough & subjective)
Cost = what it actually costs you (free tier vs your Claude subscription). Intelligence = how hard a problem you can hand it unsupervised. Reasoning = multi-step logic within a SINGLE completion (workers are single-shot, no tool loop — see the Claude tier table below for agentic reasoning). Taste = how much you'd trust its raw output on this project without a rewrite pass. Speed = relative tokens/sec (Groq/Cerebras' dedicated inference silicon is fast; OpenRouter adds a routing hop and its free tier congests). Not a hard benchmark — recalibrate from real delegation results in `../learnings.md`.

| model | provider | cost | intelligence | reasoning | taste | speed |
|---|---|---|---|---|---|---|
| claude-opus-4.8 | Anthropic (subscription) | 4 | 10 | 10 | 9 | 4 |
| claude-sonnet-5 | Anthropic (subscription) | 6 | 9 | 8 | 9 | 7 |
| zai-glm-4.7 | Cerebras (free) | 10 | 7 | 8 | 6 | 9 |
| gpt-oss-120b | Groq/Cerebras (free) | 10 | 6 | 6 | 6 | 9 |
| qwen3-coder:free | OpenRouter (free) | 10 | 6 | 5 | 7 | 5 |
| nemotron-3-ultra-550b:free | OpenRouter (free) | 10 | 6 | 6 | 5 | 5 |
| qwen3.6-27b | Groq (free) | 10 | 5 | 6 | 5 | 9 |
| llama-3.3-70b-versatile | Groq (free) | 10 | 5 | 4 | 5 | 9 |
| gemma-4-31b | Cerebras (free) | 10 | 4 | 4 | 4 | 9 |

How to apply: these are defaults for `ask-worker.mjs` roles, not limits — override freely if a cheaper model's output doesn't clear the bar. Free models are for typing (drafts, bulk, first passes); you review and decide. If a free draft fails twice on the same brief, stop chaining free models and do it yourself.

## Claude tier — orchestration & subagents (not reachable via ask-worker.mjs)
Subagents (Task/Agent tool) can only run on Claude models — they inherit the session's fixed Anthropic backend, no independent `ANTHROPIC_BASE_URL`. This tier is for the orchestrator itself and Claude-native subagents (`worker-manager`, the reviewer agents in `.claude/agents/`, Explore, general-purpose). Reasoning = depth on hard multi-step problems. Orchestration = reliability directing tools/subagents without losing the plan. Speed = relative latency.

| model | cost | intelligence | reasoning | orchestration | speed |
|---|---|---|---|---|---|
| opus-4.8 | 3 | 10 | 10 | 9 | 4 |
| sonnet-5 | 6 | 9 | 8 | 9 | 7 |
| haiku-4.5 | 9 | 6 | 5 | 6 | 10 |
| fable-5 | — | — | — | — | — |

Fable left uncharacterized rather than guessed — rate it after real use. Sonnet is the default for `worker-manager` and this project's reviewer subagents (`code-reviewer` runs `opus` — reconsider that against this table if review quality/cost tradeoffs ever need revisiting). Haiku only for genuinely mechanical dispatch with no judgment call in the loop.

## Groq — fastest; ~14,400 req/day/key
| model | best for | note |
|---|---|---|
| `openai/gpt-oss-120b` | code, reason, general | top Groq pick |
| `qwen/qwen3.6-27b` | design, multimodal | newest |
| `qwen/qwen3-32b` | reason | |
| `openai/gpt-oss-20b` | fast small tasks | |
| `llama-4-scout-17b-16e-instruct` | fast | |
| `llama-3.3-70b-versatile` | bulk/general fallback | ⚠ deprecated — migrating off |
| `llama-3.1-8b-instant` | tiny/fast | |
| `groq/compound`, `groq/compound-mini` | agentic systems | |

## Cerebras — high throughput; ~1M tokens/day
| model | best for | note |
|---|---|---|
| `zai-glm-4.7` | reason (strong) | GLM 4.7 |
| `gpt-oss-120b` | code, general | |
| `gemma-4-31b` | design, multimodal | |

Catalog shrank to 3 (Llama + Qwen-235B removed ~May 2026). Watch for further churn.

## OpenRouter — widest variety; free routes congest (429 common)
Best free: `qwen/qwen3-coder:free` (code, 1M ctx) · `openai/gpt-oss-120b:free` (reason) · `nvidia/nemotron-3-ultra-550b-a55b:free` (bulk, 1M) · `qwen/qwen3-next-80b-a3b-instruct:free` (general). **No free Kimi or DeepSeek** — both went paid in 2026.

OpenRouter also ships an official Anthropic-Messages-compatible endpoint ("Anthropic Skin" at `https://openrouter.ai/api`) — the only one of these three providers that can directly replace the `claude` CLI's own backend via `ANTHROPIC_BASE_URL`. Groq and Cerebras are OpenAI-format only and cannot power a `claude` session directly; use them through `ask-worker.mjs` instead. Third-party gateways that fake Anthropic-compat for Cerebras/Groq exist but route your key through someone else's server — don't wire one in without vetting or self-hosting it.

## Gemini (Google AI Studio)
1M context, multimodal, 1,500 req/day — but needs billing ($10 base) + a real `AIza…` key. The `AQ.…` tokens are not API keys.
