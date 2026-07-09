---
name: full-review
description: Run the layered review pipeline on the current diff or a named scope — system architecture, stack-specific code review, UI, UX, and security — then merge findings by severity. Use when the user runs /full-review, before merging a feature, or after completing a significant change.
---

# Full Review Pipeline

Orchestrate the five specialized reviewers over the target, then produce ONE merged report. Do not review inline yourself — delegate so each pass has a clean context.

## Target

`/full-review` → the working diff (`git diff` + `git diff --staged`; if clean, the last commit).
`/full-review <path or feature>` → that scope.

## Procedure

1. Determine the target files and capture the diff once.
2. Launch reviewer subagents **in parallel** (single message, multiple Agent calls), passing each the diff/file list and its focus:
   - `system-reviewer` — architecture, boundaries, data flow
   - `code-reviewer` — correctness, stack idioms, clean code
   - `security-reviewer` — auth, sessions, input trust, secrets
   - `ui-reviewer` — only if the diff touches `.tsx`/`.css` files
   - `ux-reviewer` — only if the diff touches routes or user-facing flows
3. Merge results. De-duplicate (the same missing `.inputValidator` may be flagged by code + security — report once, tag both). Discard vague findings with no file:line.

## Report format

```
## Review: <scope> — <n> findings

### 🔴 Blocker (security holes, data loss, broken rule from README/DESIGN_PATTERNS)
### 🟡 Should fix (correctness risks, pattern violations, a11y)
### 🟢 Consider (cleanups, simplifications)
```

Each finding: `file:line` — one-sentence defect — one-sentence concrete fix. End with a short "what this diff did well" line (the user is learning; reinforce good instincts) and offer: "run `/teach` on any finding to understand it deeply."

## Rules

- Findings must be verifiable in the code, not stylistic taste.
- The repo's own documented rules (README Server Architecture Rules, DESIGN_PATTERNS.md) outrank general best practice.
- Do not auto-fix anything; report only, unless the user then asks.
