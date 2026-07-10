# Worker Prompting Rules

Free models are single-shot workers: no memory, no repo access, weaker attention than the orchestrator. A brief that ignores these rules wastes the call.

## 1. Structure fights "lost in the middle"
Models attend hardest to the START and END of a prompt, weakest in the MIDDLE. Order every brief:
1. **START** — role + task + hard constraints. `"Write X. Must: TypeScript strict, no new deps."`
2. **MIDDLE** — reference material: attached files (`--file`), examples, context. A detail lost here hurts least.
3. **END** — the exact ask + output format + acceptance criteria. This is what the model acts on most strongly.

Never bury the instruction between two files. Constraints first, the ask last.

## 2. Self-contained
The worker sees ONLY the brief — no repo, no conversation, no CLAUDE.md. Include every fact it needs; reference nothing it can't see.

## 3. Lean (tokenization)
Every token is latency + context budget, and free models degrade as the prompt grows. Cut filler, restate nothing, attach only the files that matter, one task per call.

## 4. Output contract
State the shape: `"Code only, no prose"` · `"Return a JSON array of {id, reason}"`. Fewer surprises to review.

## 5. Completion marker (automatic)
`ask-worker.mjs` appends an instruction to end with `<<<WORKER_DONE>>>`, strips it from output, and warns if it's missing (missing = the response was cut off → raise `--max-tokens` or shorten the brief). You don't write the marker into the brief; you *read* its presence as "the worker finished." This is the cheap completion check — don't re-read the whole output to confirm it's done.

## 6. Few-shot only when the format is fiddly
One input→output example beats a paragraph — but only when the output shape is non-obvious. Otherwise skip it to save tokens.

## 7. Verify by redundancy, not self-report
A model can't reliably tell you when its own output is wrong — so don't add "flag if unsure/incorrect" to a brief; it's noise. Instead:
- **Inspect the result** against acceptance criteria (does it compile / run / match the required shape?). If it's off, run your own analysis or re-brief — don't ask the worker to grade itself.
- **For information/research from a worker**, confirm by redundancy: ask a sharper, more specific follow-up AND run a *second, different* model on the same question. Agreement → trust it. Divergence → escalate to Opus or dig deeper.

## 8. Too much context/code — decompose OR compact (you decide)
When input exceeds a worker's effective window (quality degrades past a few thousand tokens):
- **Decompose** when the work separates into independent sub-tasks (review N files → N briefs; build a feature → per-layer briefs). Preferred — each part stays small and checkable.
- **Compact** when the task needs the WHOLE context but not every detail (answer over a big doc, summarize a huge log): first have a `bulk` model compress to the relevant essence, then run the real task on the compact version.
- Rule: separable → **decompose**; needs-the-whole-but-not-all-detail → **compact**; if both → compact, then decompose.

## 9. Keep briefs calm and short (see writing-skills/references/prompting-wisdom.md)
~150–300 words, one task, no ALL-CAPS or "YOU MUST" (overtriggers → worse output), no "think step by step" (redundant on reasoning models). Constraints first, ask last.

## 10. Escalation (3 strikes)
Same brief fails 3× across models/providers → stop delegating, Opus does it. Two divergent worker outputs on a judgment call → Opus decides. Delegation is the default, not a mandate to keep retrying a losing brief.
