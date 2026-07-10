# Prompting Wisdom — gems from the field

High-signal ideas on prompt/context quality. People worth following: **Andrej Karpathy** (the framing below), Anthropic's applied-AI team (context engineering, skill authoring), the promptingguide.ai maintainers.

## The mental model everything hangs on (Karpathy)
> "The LLM is a CPU, the context window is its RAM, and you are the OS — responsible for loading exactly the right information into that window for each step."

Context engineering = *"the delicate art and science of filling the context window with just the right information for the next step."* The bottleneck is not **what you ask** — it's **what surrounds the ask**. (2026 industry consensus: "the year of context.")

## Now OUTDATED or actively harmful (on frontier/reasoning models)
- **"Think step by step" / explicit chain-of-thought scaffolding** — redundant or harmful for reasoning-native models; they already reason internally. Remove it.
- **Aggressive formatting** — ALL-CAPS, "YOU MUST", threat tone — **overtriggers** the model and yields *worse* output. Be calm and specific.
- **Long prompts** — reasoning starts degrading around ~3,000 tokens; a single-task brief's sweet spot is **~150–300 words**. Longer ≠ better; more context ≠ better if it's the wrong context.

## What actually works (agentic era)
Once work is multi-file/multi-service, **structure beats wording**: clear task decomposition, explicit tool permissions, context memory (learnings/notes), and review gates. Prompt polish matters less than context architecture.

## Applied in this environment
- **Worker briefs:** calm, specific, ~150–300 words, one task, constraints-first / ask-last. No ALL-CAPS, no CoT rituals.
- **Skill descriptions** may front-load explicit trigger nouns (that's *discovery*, not tone) — but bodies stay lean and calm.
- Spend orchestration effort on **what goes in the window** (right files, right acceptance criteria), not on louder wording.
- The reconciliation with "be pushy": pushy = concrete triggers in a description; it never means shouting instructions at the model.
