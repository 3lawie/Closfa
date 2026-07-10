# Provider Model Rankings (verified live 2026-07-11)

Free routes churn monthly — re-query the authoritative list anytime:
```
node -e 'fetch("https://api.groq.com/openai/v1/models",{headers:{Authorization:"Bearer "+process.env.GROQ_API_KEY}}).then(r=>r.json()).then(j=>console.log(j.data.map(m=>m.id).join("\n")))'
```
(swap host for `api.cerebras.ai/v1/models` or `openrouter.ai/api/v1/models`.) When a role starts 404ing, a model was pulled — re-query and update `CHAINS` in `ask-worker.mjs`.

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

## Gemini (Google AI Studio) — not yet active
1M context, multimodal, 1,500 req/day — but needs billing ($10 base) + a real `AIza…` key. The `AQ.…` tokens are not API keys.
