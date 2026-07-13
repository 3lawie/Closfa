---
name: Responsive & Adaptive Layouts
description: Guides the reconstruction of layouts to work seamlessly across mobile, tablet, and desktop using component swapping and container queries.
---

# Skill: Responsive & Adaptive Layouts
> **Purpose**: Guides the reconstruction of layouts to work seamlessly across mobile, tablet, and desktop. Focuses on "adaptive" UIs (changing component structure) rather than just "responsive" UIs (stretching things).

## Core Rules of Adaptive Layouts
*   **Mobile-First CSS**: Always write base styles for mobile. Use `min-width` media queries (`sm:`, `md:`, `lg:`) to add complexity as screen size increases. This results in cleaner, faster CSS.
*   **Component Swapping, Not Just Resizing**: Sometimes a component shouldn't just shrink; it should become a different component. 
    *   *Example*: A complex data table on desktop becomes a stack of swipeable cards on mobile. Use `<div className="hidden md:block">` and `<div className="block md:hidden">` to swap them out.
*   **Container Queries over Media Queries**: Components should react to their *container* size, not the *viewport* size. This allows truly reusable components. If a sidebar shrinks, the component inside should adapt, regardless of the screen size.
*   **Touch Targets**: On mobile, hit areas must be at least `44x44px`. If a button has small visual padding, use transparent padding or `::before` pseudo-elements to expand the clickable area.
*   **Bottom Sheets over Modals**: On mobile, centered modals break ergonomics. Reconstruct mobile modals to slide up from the bottom (Bottom Sheets) so they are easily reachable by thumbs.
*   **Adaptive Navigation**: 
    *   Mobile: Bottom Tab Bar or Hamburger.
    *   Tablet: Rail navigation (icons only).
    *   Desktop: Full Sidebar (icons + text).

## Recommended Tools
*   **Tailwind CSS Breakpoints**: `sm`, `md`, `lg`, `xl`, `2xl`.
*   **CSS Container Queries (`@container`)**: For modular component responsiveness.
*   **Vaul (React)**: For mobile bottom-sheet drawers.
