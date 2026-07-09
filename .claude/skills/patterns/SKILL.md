---
name: patterns
description: Reference for Closfa's chosen design patterns with do/don't examples from actual repo code. Consult before writing any server function, DB query, component, or auth-touching code. Use when the user runs /patterns or asks which pattern applies.
---

# Closfa Design Patterns Reference

Canonical sources: `README.md` (Server Architecture Rules) and `DESIGN_PATTERNS.md`. This skill indexes them and maps each rule to living code. When writing code, follow the ✅ exemplar file, not memory.

## Pattern map

| Pattern | Rule | Exemplar (✅) | Known violations to avoid repeating |
| --- | --- | --- | --- |
| BFF auth, middleware-injected session | Session decrypted once via `authMiddleware`; never `getSession()` in a handler | `src/server/lib/middleware.ts` | — |
| Drizzle dual API | `db.query.*` → object filters; `db.update/delete/insert` → `eq()/and()` | README Rule 2 examples | `where: { postId } as any` in `post.service.ts` (cast hides the object-filter type) |
| Zod input validation | Every `createServerFn` gets `.inputValidator(schema)` from `src/verification/` | `src/verification/post.validation.ts` | `post.service.ts` handlers use `data as any` — do NOT copy this |
| ServerResult union | Expected failures return `{ ok: false, error, message }`, not throws | `src/server/lib/result.ts`, `verifiers/auth.ts` | services that `throw new Error(...)` for expected cases |
| Pure verifiers | Ownership/permission checks are pure fns receiving `session`/ids | `src/server/actions/Database/verifiers/` | — |
| Rate limiting tiers | `rateLimiterMiddleWare` / composite IP+UA key for anon | `src/server/lib/rateLimiter.ts` | — |
| Sliding-window sessions | 25% renewal threshold, 30-day absolute cap | `src/server/lib/session.ts` | — |
| Edge constraints | Web APIs only; no Node built-ins | `wrangler.jsonc` runtime | — |

## When writing new code

1. Find the closest exemplar file above and mirror its structure.
2. New server action → service file in `src/server/actions/Database/services/`, schema in `src/verification/`, verifier if authz is needed.
3. New component → check `src/components/ui/` primitives first; compose, don't duplicate.
4. If no pattern fits, say so explicitly and propose one BEFORE writing code — never silently invent architecture.
