# Driving the AI Environment

How the skills, agents, and hooks work together — and how to phrase requests so the right intelligence fires.

## The architecture at a glance

| Layer | Loaded | Purpose |
| :--- | :--- | :--- |
| `CLAUDE.md` (repo root) | Always | Invariants — stack, commands, architecture rules, layout |
| **Skills** (`.claude/skills/`) | When their `description` matches the task | Principles and procedures — how to design, build, debug, review, refactor, learn |
| **Agents** (`.claude/agents/`) | When spawned (by `/full-review`) | Isolated reviewers with clean context and focused scope |
| **Hooks** (`.claude/hooks/` + `settings.json`) | Automatically, every matching lifecycle event | Deterministic guarantees: auto-format on edit, destructive commands blocked, lint+typecheck on stop, context injected at session start, notifications on completion |

## The skill catalog

Skills are arranged along the life of a feature. The model chains them automatically as work crosses layer boundaries — you don't need to name every skill.

```
IDEA ──▶ /system-design ──▶ /patterns ──▶ /web-design-patterns ──▶ /creative-ui ──▶ /full-review ──▶ /teach
         (decompose into    (discover      (data loading,           (visual layer    (5 parallel      (understand
          data model,         exemplars,     states, mutations,       design system,   reviewers        what was
          boundaries,         scaffold       pagination, flow)        tokens, a11y)    synthesize)      built)
          constraints)        new code)
```

Plus two utility skills available anytime:
- **`/debug`** — systematic diagnosis: reproduce → isolate → hypothesize → instrument → fix → verify.
- **`/refactor`** — safe restructuring: discover → diagnose debt → decompose into safe steps → scaffold → instrument.

## How to phrase requests — the Fable 5 way

The most effective prompt has three ingredients:

1. **Outcome** — what "done" looks like
2. **Constraints** — what must not change
3. **Why** — the context that connects the task to the right reasoning

### Examples

| You want | Say | Why this works |
| :--- | :--- | :--- |
| A feature designed before building | "Design a bookmarks feature — system design first, don't write code yet" | Triggers `/system-design`; "don't write code" constrains to design-only |
| A feature built end-to-end | "Build the bookmarks feature from the approved design" | `/patterns` → `/web-design-patterns` → `/creative-ui` chain automatically as work crosses layers |
| A data-loading pattern modernized | "Rework the dashboard route to use route-level loaders and streaming" | Triggers `/web-design-patterns` directly |
| A visual pass only | "Restyle the post card — creative UI, keep behavior unchanged" | "Keep behavior unchanged" constrains scope; triggers `/creative-ui` |
| A bug fixed | "The feed pagination breaks when scrolling past page 3 — debug it" | Triggers `/debug`; specific reproduction helps |
| Code cleaned up | "Refactor the comment service — reduce duplication without changing the API" | Triggers `/refactor`; "without changing the API" is the constraint |
| Judgment on finished work | "/full-review" | Spawns 5 reviewer agents in parallel |
| Understanding | "/teach src/server/lib/session.ts" | Triggers `/teach` with a specific target |

### Habits that compound

- **Scope beats size.** "Fix the feed's pagination" outperforms "improve the app." Small scope + clear intent = the right skill fires.
- **Front-load constraints.** "…without touching the schema", "…keep the current API" — constraints stated first are respected; stated after the work, they're rework.
- **Plan mode for anything structural** (`shift+tab`): research + proposal before edits. Plan mode + "system design for X" is the strongest opener.
- **Let the codebase be read.** For whole-project questions, say "read the relevant code first, then answer" — skills mandate discovery, but explicit read instructions widen the scope.
- **One feature per conversation.** Fresh context per feature keeps skills sharp; long mixed sessions blur which principles apply.
- **State the why.** "Add a loading state" is a task. "Add a loading state because users on slow connections see a blank flash for 2 seconds" is an outcome — it activates deeper reasoning.

## What fires without asking

Hooks are deterministic — they fire regardless of your phrasing:

| Event | Hook | Effect |
|---|---|---|
| Any `.ts/.tsx` file edited | `format-on-edit.mjs` | Auto-runs ESLint --fix |
| Any bash command | `guard-bash.mjs` | Blocks destructive operations (db:push, force-push, rm -rf, curl, deploy, publish) |
| Claude tries to stop | `verify-on-stop.mjs` | Runs lint + typecheck — blocks completion if errors exist |
| Session starts | `inject-context.mjs` | Injects git branch, recent commits, staged/unstaged changes |
| Notification event | `notify-done.ps1` | Windows toast notification when attention is needed |
