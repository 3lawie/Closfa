# Closfa

Aware-intention social media app. TanStack Start (React 19, TS) on Cloudflare Workers, Neon Postgres via Drizzle, Auth0 PKCE (BFF), JWE session cookies (jose), ImageKit media, Upstash Redis rate limiting, Tailwind v4.

## Commands

- `npm run dev` — dev server (Vite)
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck
- `npm run build` / `npm run deploy` — build / deploy to CF Workers
- `npm run db:push` — Drizzle schema push (NEVER run without explicit user approval)

## Architecture invariants

These are non-negotiable. Full rationale, exemplar files, and code samples live in [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md).

1. **Session decryption happens once** — via the middleware chain. Server functions read `context.session`. Route `beforeLoad` guards use the dedicated session-fetch function. Never double-decrypt.
2. **ORM API separation** — relational reads use object filters; builder writes use operator functions. Never mix. Never silence a filter type error with `as any`.
3. **Every server function validates input** — Zod schemas from the validation layer, shared with client forms. No untyped casts.
4. **Expected failures return structured results** — the error contract (`ok: true | ok: false`) replaces throws for business-logic failures. Throws are for infrastructure faults.
5. **Authorization checks are pure functions** — they receive the session as a parameter. Ownership is verified before writes, never from client-supplied IDs alone.
6. **Edge runtime only** — no Node-only APIs (fs, net, crypto callbacks). Web APIs and edge-compatible libraries only.

## Layout

Discover these directories to understand the codebase structure:

- `src/server/actions/Database/services/` — server functions (business logic + persistence)
- `src/server/lib/` — middleware, session, rate limiting, error contract, bot protection
- `src/server/db/` — ORM schema, relations, cache layer
- `src/verification/` — validation schemas shared between server and client
- `src/routes/_authenticated/` — protected routes; `src/routes/api/auth/` — auth flow
- `src/components/` — feature-grouped components; `ui/` subdirectory for shared primitives

## Conventions

- TypeScript strict; no `any` — fix the type instead
- Path alias `@/` → `src/`
- Explain non-obvious decisions when making changes (this repo doubles as a learning project)
- New code mirrors the closest existing exemplar — when no exemplar fits, propose a pattern before writing

## Delegation mandate (read before acting)

You are the ORCHESTRATOR: think, decompose, brief, review, decide. Producing code/prose/analysis in your own context is the expensive default failure mode — **resist it.** Reasoning and review stay at full power; what moves to workers is the *typing*.

**Before writing anything a worker could produce, delegate it** via `ask-worker.mjs`. Spend your own output only on: briefs & plans, reviewing worker results, and the exceptions below.

**Do it yourself ONLY when:** the same brief failed 3× across workers/providers · it touches auth/security/DB migrations · it needs live multi-file repo navigation (a worker sees only its brief) · it's a final judgment/taste call. Non-crucial questions and first-draft analysis also go to workers.

Review cheaply: check output against the brief's acceptance criteria and the completion marker — don't re-derive the work. Protocol: `/delegate`. Prompting rules: `.claude/skills/delegate/references/worker-prompting.md`.

**Task-level checkpoint:** when creating plan tasks via `TaskCreate`, note `delegate: yes — role X` or `delegate: no — <exception>` in the task so the call is explicit, not assumed. A global `PreToolUse` hook (`~/.claude/hooks/nudge-delegation.mjs`, wired in user `settings.json` — applies to every project, not just this one) reminds you if direct edits pile up with no worker call in between — treat it as a checkpoint to re-evaluate, not noise to dismiss.

## Model routing — orchestrator + free workers

The paid Claude model in this session is the ORCHESTRATOR: it plans, decomposes, delegates, reviews, and ships. Free worker models do bulk drafting, analysis, and search via `node .claude/tools/ask-worker.mjs --role <role>` (self-contained briefs; `--file` to attach context).

**Multi-provider fallback.** Each role chains across providers that each have their own free quota, so congestion on one (frequent on OpenRouter's free routes) falls through to another. Set any keys you have; the chain skips providers whose key is unset. Per-endpoint retry with backoff is built in.

| provider | key env | free quota | strength |
|---|---|---|---|
| Groq | `GROQ_API_KEY` | ~14,400 req/day | fastest; first choice |
| Cerebras | `CEREBRAS_API_KEY` | ~1M tokens/day | high throughput / bulk |
| OpenRouter | `OPENROUTER_API_KEY` | 50/day → 1,000 after one-time $10 top-up | widest model variety |
| Google AI Studio | `GEMINI_API_KEY` | 1,500 req/day | 1M context, multimodal |

Roles: `--role code` (draft functions/components), `reason` (analysis/tradeoffs), `bulk` (summarize large inputs), `design` (first-pass UI), `general`. Model IDs live in `CHAINS` in the script — re-verify against provider docs if a role 404s.

Per-model ranking (cost/intelligence/taste) and which providers can act as a live `claude` CLI backend vs. worker-only: `.claude/skills/delegate/references/provider-models.md` (project copy) — same table also lives in `~/.claude/CLAUDE.md` so it travels to every project.

How to apply:
- **Delegate down** for: summarizing/analyzing large inputs, drafting a well-specified function or component, bulk transforms, research digestion. The worker sees only your brief — make it self-contained.
- **Escalate back up (do it yourself)** for: multi-file/cross-module changes, anything touching auth/session/data/security, ambiguous requirements, design-taste calls, or output that fails review twice. Workers draft; you decide, review, ship. Never commit worker output unreviewed.
- Defaults, not limits: judge the output, not the price tag. Escalating costs less than shipping mediocre work.

## Three delegation lanes, free-first by default
1. **Direct `ask-worker.mjs` call** — DEFAULT for a fully-specified, one-shot task.
2. **`worker-manager` subagent** (global, Sonnet, no Write/Edit) — DEFAULT when the task is delegable but will likely need 1-3 rebrief/retry cycles or output checked against several files; it dispatches to the same free workers and returns one reviewed result, keeping the iteration noise out of your context.
3. **You, or a Claude-native subagent** (Explore/general-purpose/the reviewer agents in `.claude/agents/`) — LAST RESORT: multi-file repo navigation, auth/session/security/migrations, ambiguous requirements, final design-taste calls. Don't spawn a `general-purpose` subagent just because the task also needs a Write at the end — draft via lane 1/2 and apply the reviewed result yourself instead of paying for a whole Claude subagent to do both.

Subagents can only run on Claude models — a subagent inherits the session's fixed backend and cannot independently call Groq/Cerebras/OpenRouter. `worker-manager` is a Sonnet wrapper *around* worker calls, not a worker itself; there is no way to make a subagent literally *be* a free model. `zai-glm-4.7` (Cerebras) leads the `general` and `reason` chains in `ask-worker.mjs` — highest-ranked free all-rounder. Full ranking (including the orchestration/reasoning/speed axes for Claude-tier models): `.claude/skills/delegate/references/provider-models.md`.

## Skills & tooling

This repo carries an AI development environment in `.claude/` with skills, agents, hooks, and automated quality gates. See [USING_THE_SKILLS.md](./.claude/USING_THE_SKILLS.md) for the full guide.
