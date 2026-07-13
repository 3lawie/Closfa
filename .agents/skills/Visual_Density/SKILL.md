---
name: Visual Density & Data-Heavy UIs
description: Guides the reconstruction of dashboards, admin panels, and tables. Focuses on maximizing information density.
---

# Skill: Visual Density & Data-Heavy UIs
> **Purpose**: Guides the reconstruction of dashboards, admin panels, and tables. When reconstructing an app that displays massive amounts of data, the rules of "white space" change. The goal becomes maximizing information density without creating visual noise.

## Core Rules of Visual Density
*   **Increase Information-to-Ink Ratio**: Remove non-data pixels. If a border isn't strictly necessary for grouping, delete it. If an icon repeats a label's meaning, delete the icon.
*   **Condensed Spacing Scale**: In dense UIs, shift your spacing system down. Use `4px`, `8px`, and `12px` for padding instead of `16px` and `24px`.
*   **Zebra Striping vs. Borders**: For tables with many rows, alternating background colors (`bg-white` and `bg-gray-50`) is cleaner than drawing 1px borders between every row.
*   **Sticky Headers & Columns**: In large tables, the first column (identifiers) and the header row must be `position: sticky`. Context should never be lost when scrolling.
*   **Inline Editing**: Don't force users to a new page to edit a row. Reconstruct tables to allow inline editing or slide-over panels for quick modifications.
*   **Data Formatting**: 
    *   Right-align numbers. Use monospaced fonts (`font-variant-numeric: tabular-nums`) for columns of numbers so they align perfectly vertically.
    *   Truncate long strings with `text-ellipsis` and provide a tooltip on hover for the full text.
*   **Progressive Disclosure**: Hide secondary actions behind a "..." (kebab) menu in table rows. Only expose the most common action (e.g., "Edit") directly.

## Recommended Tools
*   **TanStack Table (Headless)**: For managing complex table state (sorting, filtering, pagination) while keeping you in total control of the dense styling.
*   **Tailwind `tabular-nums`**: For aligning financial/numeric data.
