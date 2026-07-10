# Skill / Agent / Hook Authoring Rules

Distilled from Anthropic's skill-authoring best practices, the Agent Skills engineering post, the hooks guide, and the sub-agents doc (all 2026). Re-verify at platform.claude.com/docs and code.claude.com/docs when something fails validation.

## Contents
1. Skill frontmatter (hard rules)
2. Descriptions that trigger
3. Body structure
4. Hooks — events & semantics
5. Agents — fields & design

## 1. Skill frontmatter (hard rules — validation rejects violations)

- `name`: ≤64 chars, lowercase + numbers + hyphens only, no XML tags, must not contain the reserved words "anthropic" or "claude". Prefer gerund naming (`processing-pdfs`) over vague (`helper`).
- `description`: non-empty, ≤1024 chars, no XML tags.
- `allowed-tools` restricts what the skill may use while active.

## 2. Descriptions that trigger

- **Third person** ("Extracts…", "Use when…") — the description is injected into the system prompt; first/second person harms discovery.
- **Pushy**: models measurably under-trigger skills. Include explicit trigger nouns AND verbs, and "use proactively when…" phrasing.
- State BOTH what it does and when to fire. The description is the only part loaded at startup — the body is invisible until it fires.

## 3. Body structure

- **≤500 lines**; past that, split into `references/`.
- **References one level deep only** — SKILL.md → reference is fine; reference → reference gets partially read.
- References >100 lines start with a table of contents (partial reads still reveal scope).
- Domain-split references so an unrelated question never loads irrelevant depth.
- **Scripts beat generated code** for deterministic ops; make intent explicit: "Run `x.py`" (execute) vs "See `x.py`" (read). Scripts solve, don't punt (handle their own errors).
- Delete anything the model already knows. Challenge each line's token cost.
- One consistent term per concept. No time-sensitive facts without a re-verify pointer.
- Wire `learnings.md`: "read before starting, append after surprises" — otherwise it's dead weight.

## 4. Hooks — events & semantics

- Key events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `SubagentStart/Stop`, `Stop`, `PreCompact/PostCompact`, `SessionEnd`. Newer: `PostToolBatch`, `PermissionDenied`, `FileChanged`, `ConfigChange`.
- **Exit codes**: 0 = no objection (does NOT auto-approve); **2 = block, stderr becomes the model's feedback**; other = proceed, error surfaced. Never mix exit 2 with JSON output.
- **Stop hooks MUST check `stop_hook_active`** and exit 0 if set (harness force-overrides after 8 consecutive blocks).
- Matchers: `Edit|Write` regex-style, case-sensitive; `Stop`/`UserPromptSubmit` take no matcher. The `if` field (`"if": "Bash(git *)"`) filters by arguments.
- All matching hooks run in parallel; most restrictive PreToolUse decision wins (deny > defer > ask > allow).
- **Performance**: a 5-second PostToolUse hook makes every edit molasses. Heavy checks belong in Stop/SessionEnd, scoped to changed files.
- `PostToolUse` cannot undo — prevention belongs in `PreToolUse`.
- Windows gotcha: Git Bash profiles that `echo` unconditionally corrupt hook JSON — wrap in `if [[ $- == *i* ]]`.
- Newer hook types: `type: "prompt"` (one cheap-model yes/no) and `type: "agent"` (multi-turn verification) for judgment gates without hardcoded commands.

## 5. Agents — fields & design

- Frontmatter: `name` + `description` required; useful optionals: `tools` (allowlist — a reviewer gets Read/Grep/Glob and CANNOT edit), `model` (haiku/sonnet/opus/fable/inherit — the cost lever), `memory: project` (accumulates codebase knowledge across sessions), `skills:` preload, `maxTurns`, `effort`.
- Body = the agent's ENTIRE system prompt; it sees no conversation history and not the full Claude Code prompt.
- **Generalize, don't snapshot**: timeless principles in the body; project state discovered at runtime (read the repo's own docs/schema/components first, judge against what's found). Hardcoded project facts go stale and freeze the design.
- Verifier/generator split: the reviewer never fixes; the fixer never grades itself.
- One responsibility per agent — a do-everything agent delegates badly because its description matches everything and nothing.
- Include "use proactively after X" in descriptions to drive automatic delegation.
