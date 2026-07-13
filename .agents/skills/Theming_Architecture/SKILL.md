---
name: Advanced Theming & Dark Mode Architecture
description: Guides the structural reconstruction of app colors using semantic CSS variables.
---

# Skill: Advanced Theming & Dark Mode Architecture
> **Purpose**: Guides the structural reconstruction of app colors. Reconstructing an app to support multiple themes (Light, Dark, High Contrast) requires a semantic approach to color tokens, not hardcoded hex values.

## Core Rules of Theming
*   **Never Hardcode Colors**: Never use `bg-blue-500` directly on a component. Instead, define semantic tokens in your CSS variables: `--color-primary`, `--color-background`, `--color-surface`.
*   **Semantic Token Mapping**: Map raw colors to semantic purposes.
    *   `bg-background` (the app canvas)
    *   `bg-surface` (cards, panels)
    *   `bg-surface-hover` (hover states)
    *   `text-primary`, `text-secondary`, `text-muted`
*   **Dark Mode is Not Inverted Light Mode**: Don't just invert colors. Dark mode requires desaturating backgrounds. A pure `#000000` background is too harsh; use a very dark, desaturated blue/grey (e.g., `hsl(222, 47%, 11%)`).
*   **Elevation in Dark Mode**: In light mode, elevated elements use shadows. In dark mode, shadows are invisible. Elevated elements in dark mode must use slightly lighter background colors instead of shadows.
*   **Contrast over Brand**: In dark mode, your brand's primary blue might need to be lightened (rotating the hue towards cyan) to maintain a 4.5:1 contrast ratio against the dark background.
*   **System Font UI**: Ensure all form controls, borders, and focus rings automatically inherit the semantic theme tokens.

## Recommended Tools
*   **CSS Variables (Custom Properties)**: The foundation of theming.
*   **Tailwind CSS `dark:` variant**: Or Tailwind v4's `dark` variant configuration.
*   **next-themes**: For SSR-safe theme switching without flash of unstyled content (FOUC).
