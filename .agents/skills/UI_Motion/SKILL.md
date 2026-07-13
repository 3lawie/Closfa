---
name: UI Motion & Micro-Interactions
description: Guides the reconstruction of UI animations for transitions, routing, and feedback.
---

# Skill: UI Motion & Micro-Interactions
> **Purpose**: Guides the reconstruction of UI animations. Good UI motion isn't about flashy entrances; it's about spatial continuity, providing feedback, and maintaining the user's mental model of the app. Use this skill when adding transitions, page routing, or interactive feedback.

## Core Rules of UI Motion
*   **Animatable Properties Only**: Never animate `width`, `height`, `top`, or `left`. These cause browser reflows and jank. Animate `transform` (translate, scale, rotate) and `opacity` only.
*   **Duration Limits**: 
    *   Micro-interactions (hover, toggle): 100ms - 150ms.
    *   Small UI transitions (dropdowns, tooltips): 200ms - 250ms.
    *   Large UI transitions (modals, page routes): 300ms - 400ms. Never exceed 400ms for routine UI.
*   **Easing is Everything**: Never use `linear`. It looks robotic. 
    *   Use `ease-out` for elements entering the screen (fast start, slow end).
    *   Use `ease-in` for elements leaving the screen.
    *   Use `ease-in-out` for elements moving across the screen.
*   **Spatial Continuity**: If a modal opens from a button click, the modal should scale and translate from the button's position, not just fade in at the center of the screen.
*   **Interruptible Animations**: Never block user input while an animation is finishing. If a user clicks a button to open a menu, then clicks it again, the menu should reverse its animation from its current state, not wait to finish opening first.
*   **Respect Reduced Motion**: Always wrap motion logic in a check for `prefers-reduced-motion: reduce`. If true, disable animations and use instant state changes.

## Recommended Tools
*   **Framer Motion (React)**: Best for component-level animations and layout transitions (`layoutId`).
*   **View Transitions API**: Best for route-to-route transitions in modern browsers.
*   **Tailwind CSS `transition-*` classes**: Best for simple hover/active states.
