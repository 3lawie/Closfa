---
name: project-color-contrast-audit-2026-07-13
description: Two root-cause color bugs found in src/index.css OKLCH token system during a full-app contrast audit (2026-07-13) — one CSS cascade bug, one token-lightness bug. Check whether fixed before re-auditing from scratch.
metadata:
  type: project
---

Full-app contrast audit requested by user 2026-07-13 ("some when hover it got bad contrast, run whole check for the app coloring") turned up two systemic root causes, not isolated typos:

1. **`.dark` accent block is dead CSS** — `src/index.css` has `:root` (line 53) → `.dark` (line 90, sets a lighter dark-specific `--accent`/`--accent-hover`/`--accent-bg`/`--accent-border`) → a second plain `:root` (line 118, redeclares the same four vars with the *light-mode* values). `.dark` is applied to `document.documentElement` (`src/routes/__root.tsx:51`, `ThemeToggle.tsx`), so `<html class="dark">` matches both `:root` and `.dark` with **equal specificity** (0,1,0 each) — last rule in source wins, and the second `:root` comes after `.dark`. Result: the dark-mode-tuned accent (L=0.78, softer) never applies; dark mode silently reuses the light-mode accent (L=0.72) against a much darker surface. Intent (per the file's own header comment) was clearly for `.dark` accent to win.

2. **`--accent` (L≈0.72) and `--brand` (L≈0.70) are too light/medium to serve as light-mode text or icon color.** Computed relative luminance (OKLab matrix, verified against known sRGB gray reference): accent Y≈0.394, brand Y≈0.332, vs. `--surface`/`--bg` white Y=1.0. Contrast ≈2.2–2.8:1 in light mode — fails both 4.5:1 (text) and 3:1 (icons/UI components) thresholds. This repeats across dozens of call sites: any `text-accent`/`hover:text-accent`/`text-brand`/`hover:text-brand` on a light surface, and any `text-accent` inside `bg-accent-bg` (a 10–14% tint of the same accent, itself Y≈0.94 — nearly as light as white, so it doesn't rescue the pairing). Dark mode mostly escapes this by accident (bug #1 keeps accent dark-adjacent to a very dark surface), except where accent sits on `accent-bg`.

Compounding, unrelated bug: **`--danger`/`--danger-hover` hover pairs collapse to ~1.3:1 contrast** where a component uses `hover:text-danger hover:bg-danger-hover` together (e.g. `PostCard.tsx:662`, the delete-post icon button) — hover darkens danger in light mode and *lightens* it in dark mode, either way converging text and background to nearly the same red. This is likely the exact bug the user noticed.

**Status as of 2026-07-13: reported only, not fixed** (audit was report-only per task). Before trusting these specifics in a future conversation, re-check `src/index.css` — if the cascade/token values have since changed, redo the OKLab luminance math rather than reusing these numbers verbatim. Related: [[contrast-estimation-method-oklch]].

How to apply: if asked to fix Closfa's color system, start with these two root causes (cascade fix + re-tuning `--accent`/`--brand` lightness for light-mode text use) rather than patching each of the ~15+ downstream call sites individually — the downstream sites are symptoms, not the disease.
