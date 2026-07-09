---
name: creative-ui
description: Produce distinctive, modern, accessible UI for Closfa instead of generic AI-looking output. Use whenever building or restyling any visible component, page, or layout — before writing the first className. Reads the whole existing component system first so new UI belongs to the app.
---

# Creative UI

Closfa is an *aware-intention* social app — calm, deliberate, anti-doomscroll. The UI must feel considered and quiet, not like a template. This skill governs how UI gets built; `/web-design-patterns` governs how it behaves.

## Step 1 — Read before you style (non-negotiable)

Before any new UI: read `src/index.css` (tokens/theme), `src/components/ui/` (Button, Card, Input, Spinner), and the two closest sibling components to where you're working. New UI must look like it was always there. If a primitive is missing (e.g. Modal, Toast), propose adding it to `src/components/ui/` — never inline a one-off.

## Step 2 — Design intent, then code

State in one line the feeling the surface should give (e.g. "reading a considered post, not scrolling a slot machine"), then derive choices from it. If you can't articulate the intent, the output will be generic.

## House rules

- **Tokens over values.** Spacing, radius, and color come from the existing scale; a hardcoded `w-[347px]` or hex value needs a written reason.
- **Avoid the AI-generated look**: no gradient-hero-on-white, no emoji as section markers, no `rounded-lg` + `shadow-md` on every box, no centered-everything. Closfa's voice: generous whitespace, strong typographic hierarchy, restrained accents.
- **Typography carries the design.** Set a real scale (size + weight + line-height per level) and stay on it; body text ~65ch; headings `text-wrap: balance`.
- **Motion is earned.** One deliberate transition per surface (e.g. a post card settling in) beats scattered hover effects. Respect `prefers-reduced-motion`. Nothing loops forever in a "calm" app.
- **Dark and light are both first-class.** Any new color decision is made as a token pair, checked on both grounds.
- **Accessibility is part of the look:** real `<button>`/`<a>`, visible focus states (never bare `outline-none`), labeled inputs, meaningful `alt`, 4.5:1 contrast for text.
- **Media discipline:** images reserve aspect-ratio space before load (no layout shift); the mosaic (`src/lib/utils/mosaic.ts`, `MediaContatiner.tsx`) handles 1–n images gracefully; text over images gets a scrim.
- **`cn()` for conditional classes** (`src/lib/utils/cn.ts`), never template-string concatenation.

## Definition of done for any UI task

1. Uses/extends `src/components/ui/` primitives
2. All four states designed (loading skeleton, empty, error, content — per `/web-design-patterns`)
3. Holds at 360px width and at desktop
4. Keyboard path works; focus visible
5. Both themes checked

## Handoffs (skill chaining)

- Behavior/data questions while styling → `/web-design-patterns`.
- The surface needs a new server capability → stop, run `/system-design` first.
- Finished → `/full-review` (ui-reviewer + ux-reviewer agents check this skill's rules).
- Don't understand why a rule exists → `/teach <the rule>`.
