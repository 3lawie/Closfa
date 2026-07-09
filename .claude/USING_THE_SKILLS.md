# Driving the Closfa AI Environment

How the skills, agents, and hooks in this folder work together, how Claude moves from one skill to another, and how to phrase requests so the right machinery fires.

## The pieces and their altitude

| Piece | Loaded | Job |
| :--- | :--- | :--- |
| `CLAUDE.md` (repo root) | Always | Facts + invariants (the six rules, layout, commands) |
| **Skills** (`.claude/skills/`) | When their `description` matches the task | Procedures and knowledge — how to design, build, review, learn |
| **Agents** (`.claude/agents/`) | When spawned (usually by `/full-review`) | Isolated reviewers with clean context |
| **Hooks** (`.claude/hooks/` + `settings.json`) | Automatically, every matching tool call | Guarantees: auto-lint on edit, destructive commands blocked |

## The skill catalog and the lifecycle they form

Skills are arranged along the life of a feature:

```
IDEA ──▶ /system-design ──▶ /patterns ──▶ /web-design-patterns ──▶ /creative-ui ──▶ /full-review ──▶ /teach
         (architecture,      (server:       (routes, data           (the visual      (5 parallel      (understand
          data model,         service/       loading, caching,       layer)           reviewers)       what was
          boundaries)         verifier/      optimistic UI,                                            built)
                              validation)    states)
```

- **`/system-design`** — before code: data model, route/data flow, boundary table. Design first, approve, then build.
- **`/patterns`** — the server rulebook: which exemplar file to mirror for services, verifiers, Zod schemas.
- **`/web-design-patterns`** — the app-flow rulebook: loaders vs component queries, cursor pagination, optimistic vs pessimistic mutations, the four mandatory states.
- **`/creative-ui`** — the visual rulebook: read existing primitives first, tokens over values, both themes, a11y, anti-generic-AI-look rules.
- **`/full-review`** — spawns the five reviewer agents in parallel (system, code, security, ui, ux) and merges findings by severity.
- **`/teach`** — explains any code or change: the pattern, why here, tradeoff, alternatives, exercise.

## How skills chain (this is the important mental model)

Claude doesn't need you to name every skill. Two mechanisms move it from one skill to the next:

1. **Trigger by description.** Each SKILL.md frontmatter `description` says *when it applies*. When the conversation reaches a matching sub-task, Claude loads that skill — mid-task. Ask to "build a bookmarks feature" and the work itself walks the chain: designing → `system-design` fires; writing the service → `patterns`; the route → `web-design-patterns`; the component → `creative-ui`.
2. **Explicit handoffs.** Every skill here ends with a **Handoffs** section telling Claude which skill owns the neighboring problem ("the surface needs a new server capability → stop, run /system-design first"). That's a skill *instructing the model to switch skills* — the chain is written into the skills themselves.

The reviewers close the loop: `ui-reviewer` and `ux-reviewer` read `creative-ui` and `web-design-patterns` as their criteria, so **the same rules that guided the building do the judging.** When you change a rule, change it in one skill file and both sides update.

## Phrasing requests for best results

The pattern: **verb + scope + the skill's trigger words**. The description matching is semantic — use the vocabulary from the skill you want.

| You want | Say | What fires |
| :--- | :--- | :--- |
| A feature designed before building | "**Design** a bookmarks feature — **system design** first, don't write code yet" | system-design |
| A feature built end-to-end | "Build the bookmarks feature from the approved design" | patterns → web-design-patterns → creative-ui (in sequence, as the work reaches each layer) |
| A page modernized | "Rework the dashboard **route's data loading and states** to the modern patterns" | web-design-patterns (+ creative-ui if visuals change) |
| A visual pass only | "Restyle the post card — **creative UI**, keep behavior" | creative-ui |
| Judgment on finished work | "/full-review" (or "review this before I merge") | full-review → 5 agents |
| To understand something | "/teach src/server/lib/session.ts" | teach |

Sharper habits:

- **Scope beats size.** "Fix the feed's pagination" outperforms "improve the app". Small scope + clear intent = the right single skill; vague scope = generic output.
- **Front-load constraints.** "…without touching the schema", "…keep the current API" — constraints stated first are respected; stated after the work, they're rework.
- **Plan mode for anything structural** (`shift+tab`): research + proposal before edits. Combine: plan mode + "system design for X" is the strongest opener in this repo.
- **Let the project be read.** For whole-app questions ("is our data flow modern?"), say "**read the relevant code first**, then answer" — the skills mandate reading exemplars, but an explicit read instruction widens it.
- **One feature per conversation.** Fresh context per feature keeps skills sharp; long mixed sessions blur which rules apply.

## What you never have to ask for

Hooks fire regardless of phrasing: every `.ts/.tsx` edit is auto-linted; `db:push`, `wrangler deploy`, `git push --force`, `git reset --hard`, and destructive SQL are blocked with an explanation. Lint/typecheck/git-reads run without permission prompts.
