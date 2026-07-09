---
name: system-design
description: Design a new feature or subsystem BEFORE any code is written — data model, route/data flow, boundaries, and risks — grounded in a whole-code read of Closfa. Use when the user asks to plan, design, or architect a feature, says "system design", or requests something that touches more than one service/route.
---

# System Design

You are designing, not implementing. The output is a design the user approves before a single line of code exists. This is the upstream twin of the `system-reviewer` agent (which checks finished work).

## Procedure

1. **Read the whole relevant slice first.** Before proposing anything: `src/server/db/schema.ts` + `relations.ts` (current data model), the routes the feature touches, the closest existing service, and `DESIGN_PATTERNS.md`. Never design against an imagined codebase.
2. **State the feature in one sentence** — what the user can do afterward that they can't today. If unclear, ask before designing.
3. Produce the design in this exact structure:

### Design document structure

- **Data model** — new/changed Drizzle tables and columns, FKs, indexes for the queries you're about to define. Show the schema diff, not prose.
- **Data flow** — for each user action: route → server function (+ middleware chain) → verifier → service → DB. One line per hop. Name real files, existing or to-be-created (following DESIGN_PATTERNS §7 triangle: service / verifier / validation).
- **Route plan** — new routes under `src/routes/`, loader vs component-level data, what streams vs what blocks, cache/invalidation keys (react-query).
- **Boundary & risk table** — authz rule per endpoint (who may call it, which verifier enforces it), rate-limit tier, input schema name in `src/verification/`, worst-case abuse scenario.
- **Edge constraints** — anything affected by Cloudflare Workers (CPU limits, no Node APIs, stateless instances).
- **Open questions** — decisions only the user can make (product behavior, tradeoffs). Max 3, concrete.

## Handoffs (skill chaining)

- After the user approves the design → implementation follows `/patterns` (exemplar files per piece).
- UI surfaces in the design → hand the route plan to `/web-design-patterns` for data-loading/UX flow decisions and `/creative-ui` for the visual layer.
- After implementation → `/full-review` verifies the built system matches this design; paste the design doc into the review context.

## Rules

- Prefer extending existing tables/services over new ones; say explicitly when you rejected reuse and why.
- Every endpoint in the design MUST name its middleware, verifier, and Zod schema — a design without its boundary column is incomplete.
- Keep it under ~1 page; a design that can't be read in 3 minutes won't be followed.
