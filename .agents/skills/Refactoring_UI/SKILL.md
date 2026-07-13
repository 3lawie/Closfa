---
name: Refactoring UI
description: A complete system and workflow for reconstructing UI like a senior designer.
---

# Skill: Refactoring UI

## 1. The Core Stack (The Tools)

*   **Styling: Tailwind CSS**
    *   *Why it fits:* Tailwind is the ultimate tool for the "Limit your choices" rule. Instead of arbitrary CSS values, Tailwind forces you to use a predefined spacing, typography, and color scale.
*   **Component Architecture: React (or Next.js) + shadcn/ui**
    *   *Why it fits:* `shadcn/ui` provides unstyled, highly accessible primitives. This aligns perfectly with the rule *"Semantics are secondary"* and *"Think outside the box."* You keep 100% control over the visual hierarchy, borders, and spacing.
*   **Icons: Lucide React**
    *   *Why it fits:* Provides consistent, scalable vector icons. This helps with the *"Balance weight and contrast"* rule.
*   **Fonts: Geist or Inter (via next/font)**
    *   *Why it fits:* Highly legible neutral sans-serifs with multiple weights (400, 500, 600, 700).

## 2. Setting Up the Design System (The Foundation)

*   **Color Palette (HSL/OKLCH format):** Define 9 shades (50-900) for your primary, grey, and accent colors.
*   **Spacing Scale:** Rely on Tailwind's default non-linear scale (1, 2, 3, 4, 6, 8, 12, 16, 24). Never use arbitrary values like `p-[13px]`.
*   **Typography Scale:** Hand-pick 5-6 font sizes (e.g., `text-sm`, `text-base`, `text-xl`, `text-3xl`, `text-5xl`) and set proportional line-heights.
*   **Shadow System:** Define exactly 3-4 elevations (e.g., `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`) using the two-part shadow technique (ambient + direct light).

## 3. The Workflow (How to execute)

### Step 1: Feature-First Isolation
*   **Action:** Identify the core feature of the requested screen. Do not build the app shell (navbars, sidebars) first. Build the actual form, table, or dashboard widget in isolation.

### Step 2: Grayscale & Hierarchy Pass
*   **Action:** Write the component using only white, black, and 3 shades of grey. Use font weight (600 for emphasis, 400 for normal) and font size to establish hierarchy. Ensure labels are omitted where possible, or de-emphasized.

### Step 3: Spacing & Layout Pass
*   **Action:** Apply the spacing system. Start with generous white space (`gap-6`, `py-8`). Ensure the space *within* groups is smaller than the space *around* groups. Use a max-width constraint (`max-w-2xl`) instead of stretching content across the whole screen.

### Step 4: Color & Depth Integration
*   **Action:** Introduce the primary color only for primary actions. Add accent borders to active states. Apply the two-part shadow system to elevate cards or modals. Ensure text on colored backgrounds uses hand-picked colors, not opacity.

### Step 5: The Finishing Touches
*   **Action:** Remove unnecessary borders and replace them with background contrast or spacing. Add icons to bulleted lists. Style empty states.
