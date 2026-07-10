---
name: delegate
description: Route bulk work to free OpenRouter worker models via .claude/tools/ask-worker.mjs so the paid orchestrator model only plans, reviews, and ships. Use proactively whenever a subtask is self-contained and token-heavy — summarizing large files or logs, drafting a well-specified function/component/schema, bulk analysis or extraction, digesting documentation — or when the user says "delegate", "use a worker", "save tokens", or "use the free models".
allowed-tools: Bash, Read, Grep, Glob
---

# Delegate to Free Workers

Orchestrator-worker pattern: the expensive model (you) decomposes and verifies; free models execute. Read `learnings.md` beside this file before delegating; append entries when a worker surprises you (good or bad).

## Governing Principle

> **Delegate the tokens, keep the judgment.** A worker sees ONLY what you send it — no conversation, no repo, no CLAUDE.md. Every delegation is a self-contained brief. Every result is reviewed before it touches the codebase.

## Procedure

1. **Classify** the subtask (routing table in CLAUDE.md is authoritative):
   - `--role code` — draft a function/component/schema from a complete spec
   - `--role reason` — analysis, tradeoff enumeration, explanation drafts
   - `--role bulk` — summarize/extract from large inputs (1M context)
   - `--role design` — first-pass UI markup (you do the taste pass after)
   - `--role general` — everything else mechanical
2. **Brief** like a spec, not a chat: task + constraints + output format + acceptance criteria, and attach every needed file with `--file`. If the brief needs more than ~3 files of context, the task is too entangled — don't delegate it.
3. **Dispatch**: `node .claude/tools/ask-worker.mjs --role <role> [--file <path>]... "<brief>"` (long briefs via stdin: end with `-`). Fallback chains and 429 handling are built into the script.
4. **Verify** (chain-of-verification, never skip): read the output as a hostile reviewer — check it against the acceptance criteria, the repo's patterns (`/patterns`), and type-reality. Workers hallucinate imports and APIs; you ground them.
5. **Integrate or escalate**: apply what survives review, rewrite what doesn't. Two failed rounds on the same brief = stop delegating; do it yourself.

## Never delegate

- Anything touching auth, sessions, security, or migrations
- Multi-file refactors or work needing live repo navigation
- Final design-taste decisions and anything committed without review
- Secrets or `.env` contents in a brief — workers are third-party APIs; some free routes log prompts

## Handoffs

- Worker output needs pattern conformance → `/patterns`. Draft UI needs the taste pass → `/creative-ui`. Integrated work → `/full-review`.
