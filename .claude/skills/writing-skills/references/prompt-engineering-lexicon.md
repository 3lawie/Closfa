# Prompt-Engineering Lexicon (2025–2026)

Field-standard terms that compress meaning. Tags: [standard] = safe to use bare; [emerging] = current, Anthropic-era; [loose] = real concept, always add a five-word gloss.
Sources: Anthropic "Effective context engineering for AI agents", Anthropic skill-authoring best practices, promptingguide.ai context-engineering guide, Wharton Prompting Science Report 2025.

## Contents
1. Context & structure
2. Planning & decomposition
3. Verification & evaluation
4. Multi-model patterns
5. Caveats — what NOT to bake in

## 1. Context & structure

- **Context engineering** [emerging→standard] — curating the optimal token set present on every inference call (system prompt, tools, history, retrieved docs, memory). The successor framing to "prompt engineering".
- **Progressive disclosure** [standard] — reveal detail in layers; metadata always loaded, body on trigger, references on demand. The architecture of a good skill.
- **Right altitude** [emerging] — instructions specific enough to steer, flexible enough that model intelligence dominates; between brittle hardcoding and vague hand-waving.
- **Context rot** [emerging] — recall degrades as the window fills; the physical reason to stay lean.
- **Just-in-time context** [emerging] — hold lightweight identifiers (paths, queries), load content at runtime instead of pre-loading.
- **Compaction** [standard] — summarize history near the limit; keep decisions, drop noise.
- **Structured note-taking / agentic memory** [emerging] — persist notes outside the window (learnings.md, MEMORY.md), re-read later for cross-session coherence.
- **Semantic anchoring** [loose] — *one consistent term per concept* so the model binds a single meaning.
- **Few-shot exemplars** [standard] — input/output pairs anchor style and format better than descriptions.
- **Constraint-first prompting** [loose] — *hard invariants stated before task*; constraints stated after the work arrive as rework.

## 2. Planning & decomposition

- **Plan-then-execute / plan-validate-execute** [standard] — produce a structured plan, validate it (machine or review), then act. Use verifiable intermediate outputs (e.g. a changes list validated before applying).
- **Decompose** [standard] — split into independently checkable subtasks; each leaves the system working.
- **Orchestrator-worker pattern** [standard] — a coordinator routes self-contained briefs to specialized workers; workers see only their brief.
- **Degrees of freedom** [emerging] — calibrate instruction specificity to task fragility: high freedom for review/design, low freedom (exact scripts) for migrations/auth/format.
- **10-80-10** [loose] — *plan tenth, execute bulk, verify tenth*: ~10% spec, 80% model-driven execution, 10% human verification.

## 3. Verification & evaluation

- **Verifier/generator split** [standard] — the producer never grades its own output; a separate agent/turn reviews. The foundation of the reviewer-agent design.
- **Chain-of-verification (CoVe)** [standard] — draft → generate verification questions → answer them independently → revise. Cuts hallucination on factual/integration work.
- **Rubric-based evaluation / chain-of-rubrics** [standard/emerging] — score against explicit modular criteria instead of holistic vibes; each reasoning step aligned to a rubric item.
- **Reflection / self-critique loop** [standard] — critique own draft against criteria, revise, 2–6 cycles max.
- **Feedback/validator loop** [standard] — run validator → fix → repeat (lint, typecheck, tests as the loop condition).
- **Evaluation-driven development** [emerging] — write the eval scenarios BEFORE the instructions; skills must solve observed failures, not imagined ones.
- **Tool-use grounding** [loose] — *trust observations over parametric memory*: verify by driving the real flow, not by asserting.

## 4. Multi-model patterns

- **Model routing** [standard] — per-task model choice by cost/intelligence/taste table; defaults not limits — judge output, not price tag.
- **Escalation rule** [loose] — *when to abandon the cheap path*: two failed reviews, ambiguity, or safety-touching scope → escalate to the smart model.
- **Clean-context subagent** [standard] — isolated window, returns only a summary; verbose exploration never pollutes the orchestrator.

## 5. Caveats — what NOT to bake in

- **CoT scaffolding & self-consistency voting**: negligible gain on reasoning-native models (Wharton 2025) — don't add "think step by step" rituals to skills targeting frontier models.
- **Time-sensitive facts** (model IDs, prices, versions): mark with a re-verify pointer instead of stating as permanent truth.
- **Definitions of things the model knows**: the canonical anti-example is a paragraph explaining what a PDF is. Delete.
