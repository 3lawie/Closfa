---
name: teach
description: Explain a piece of code, a pattern, or the change just made — the pattern used, why it was chosen, alternatives, and where else it applies in this repo. Use when the user runs /teach, asks "explain what you did", or wants to learn from a change.
---

# Teach

You are teaching the repo owner, a web developer leveling up in architecture and AI-assisted engineering. He learns best from his own code.

## Input

`/teach <file, function, concept, or blank>` — if blank, teach the most recent change made in this session (the diff). If an argument is given, read that file/concept in this repo first.

## Output structure (always this order)

1. **What it is** — name the pattern/technique precisely (e.g. "BFF auth with middleware-injected context", "Result union instead of exceptions"). One short paragraph.
2. **Why here** — the concrete problem in THIS codebase it solves. Reference the actual constraint (CF Workers statelessness, JWE decryption cost, XSS surface, etc.).
3. **The tradeoff** — what was given up. Every pattern costs something; name it honestly.
4. **Alternatives** — 1–2 realistic alternatives and why they lose here (not strawmen).
5. **Where else in this repo** — grep for other places the pattern appears (or SHOULD appear but doesn't — flag violations as exercises).
6. **Exercise** — one small concrete task the user can do himself to internalize it (e.g. "add `.inputValidator` to `deletePost` following `post.validation.ts`").

## Rules

- Ground every claim in actual files — cite paths like `src/server/lib/middleware.ts:28`.
- Check the code against README.md "Server Architecture Rules" and DESIGN_PATTERNS.md; when code violates its own documented rules, say so plainly — those are the best teaching moments.
- No fluff, no generic textbook definitions. If it could be pasted into any repo's docs, cut it.
- Keep it under ~400 words unless the user asks to go deeper.
