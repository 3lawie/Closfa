---
name: UX Copy & Microcopy Architecture
description: Guides the reconstruction of the text within the UI. Ensures the language matches the personality established in the UI.
---

# Skill: UX Copy & Microcopy Architecture
> **Purpose**: Guides the reconstruction of the text within the UI. UI design is 50% words. Bad copy ruins good visual hierarchy. This skill ensures the language matches the personality established in the Refactoring UI skill.

## Core Rules of UX Copy
*   **Action-Oriented Verbs**: Buttons should start with a verb. Not "Submit" or "Save", but "Create Account", "Send Invoice", "Publish Post".
*   **Pronoun Consistency**: Decide if the app speaks as "We" (the company) or "You" (the user). Stick to it. "We will save your progress" vs "Your progress is saved".
*   **Empty States are Sales Pitches**: When a list is empty, don't just say "No items". Reconstruct empty states to explain the value. "Create your first project to start tracking time."
*   **Error Messages that Help**: Never blame the user. Don't say "Invalid input". Say "Passwords must be at least 8 characters long."
*   **Formatting Numbers and Dates**: Always use relative time for recent events ("2 hours ago", "Yesterday") and absolute time for older events ("Jan 12, 2024"). 
*   **Brevity is King**: If a paragraph explains a feature, cut it down to one sentence. If one sentence works, cut it to two words. Visuals should do the heavy lifting; text provides clarity.

## Recommended Tools
*   **Native JavaScript `Intl` API**: For formatting dates, numbers, and currencies based on user locale without external libraries.
*   **Lingui / i18next**: For managing copy if the app requires internationalization.
