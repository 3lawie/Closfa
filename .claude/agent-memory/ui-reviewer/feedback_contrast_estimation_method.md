---
name: contrast-estimation-method-oklch
description: How to estimate WCAG contrast ratios from OKLCH token values without a browser — used for Closfa's OKLCH design system, reusable for any OKLCH-based token audit.
metadata:
  type: feedback
---

For projects whose tokens are defined in OKLCH (e.g. Closfa's `src/index.css`), WCAG relative luminance can be estimated directly from the token values without rendering anything:

- **Pure/near-neutral grays (chroma ≈0):** relative luminance Y ≈ L³ (OKLab lightness cubed). Verified against a known reference (#808080 ≈ L 0.6 in OKLab, real sRGB relative luminance ≈0.216, and 0.6³ = 0.216 — exact match). Fast enough to do by hand for token tables.
- **Chromatic colors:** need the full OKLab→linear-sRGB matrix (Björn Ottosson's coefficients: l_/m_/s_ mix of L,a,b where a=C·cos(h), b=C·sin(h); cube each; then the 3×3 linear-RGB matrix; then Y = 0.2126R + 0.7152G + 0.0722B). Tedious but tractable by hand for a handful of tokens; don't skip it and eyeball hue+lightness instead — medium-lightness saturated colors (e.g. L=0.7 green/amber) can still fail 4.5:1 against white even though they don't look "light" at a glance.
- Then contrast ratio = (Y_lighter + 0.05) / (Y_darker + 0.05), same as standard WCAG.
- Remember the *threshold* differs by content type: 4.5:1 for normal text, 3:1 for large text (≥18.66px bold or ≥24px regular) and for icons/UI components conveying meaning (WCAG 1.4.11) — don't apply 4.5:1 uniformly to icon-only buttons, but don't let icons off the hook entirely either.
- For translucent tokens (e.g. `--accent-bg` at 10–14% alpha), approximate the composite by alpha-blending Y values directly (`Y_blend = alpha·Y_fg + (1-alpha)·Y_bg`) rather than blending in OKLCH space — close enough for an estimate, and much faster.

Why this matters here: eyeballing OKLCH hex-free tokens is unreliable — this method caught real failures (Closfa's `--accent`/`--brand` against white, ~2.2–2.8:1) that would look "fine" in a quick visual scan. See [[project-color-contrast-audit-2026-07-13]] for the audit this method produced.

How to apply: reuse this whenever asked to audit contrast in an OKLCH-token codebase and no live browser/devtools contrast checker is available in the environment.
