---
name: chunking-large-files
description: Splits a huge text/code/log file, or a PDF/DOCX/PPTX document, into coherent chunks on disk using Chonkie (and Marker for document conversion) so Claude never reads the whole thing into its own context. Use proactively before reading, summarizing, or analyzing any file that is very large (roughly 1000+ lines, several hundred KB+, or a PDF/DOCX/scanned document) — or when the user says "this file is huge", "chunk this", "summarize this document", or names a file you haven't sized yet that might be large.
allowed-tools: Bash, Read, Glob
---

# Chunking Large Files

Read `learnings.md` beside this file before using this skill; append entries when a chunking mode surprises you (over-fragments, mis-detects language, etc).

## Governing Principle

> **Never read a huge file whole.** Split it into chunks with real structural boundaries (function/class, paragraph, or fixed token windows — whichever fits the content), then hand chunks to `/delegate`'s `ask-worker.mjs --role bulk` for summarization/extraction. Read back only the aggregated result. This skill is a preprocessing step for delegation, not a replacement for it — see "When NOT to use this" below.

## Procedure

1. **Size-check first.** `wc -l <file>` or check byte size. If the file comfortably fits one `ask-worker.mjs --role bulk --file <path>` call (bulk role already handles up to ~1M tokens via its Gemini leg), skip this skill and delegate directly — chunking only earns its cost under the conditions in step 2.
2. **Decide if chunking is actually warranted:**
   - The file needs format conversion first (PDF/DOCX/PPTX) — chunking is not optional here, Marker must run first regardless of size.
   - You want **per-section or per-function** summaries rather than one flattened summary (e.g. "summarize each service file's functions" instead of "summarize this file").
   - The file is too large even for a single bulk call, or has mixed unrelated sections that shouldn't be smushed into one prompt.
3. **Pick the mode** (this is the judgment call — the script defaults to `auto` but you should override when you know better than the extension-based heuristic):

   | File looks like | Mode | Why |
   |---|---|---|
   | Source code (`.ts .tsx .js .py .go .rs .java .rb .c .cpp .cs .php`) | `code` | Splits on tree-sitter syntax nodes (functions/classes), coalesced up to `--chunk-size` — keeps a function's body in one chunk instead of cutting mid-function |
   | Markdown / prose / docs (`.md .txt .rst`) | `recursive` | Splits on paragraph → sentence → word boundaries, in that priority order — never cuts mid-sentence if it can help it |
   | Logs, JSON, CSV, data dumps with no prose/code structure | `token` | No natural semantic unit exists; just take fixed-size windows |
   | You need topically-coherent chunks for retrieval-quality work (rare — this is a RAG concern, see `../../to read/web environment/00-overview-and-rag-pipeline.md`) | `semantic` | Groups by embedding similarity instead of position. **First use downloads a small local embedding model (minishlab/potion-base-32M, CPU-only, no API key) — one-time delay.** |
   | `.pdf` / `.docx` / `.pptx` | *(handled automatically)* | Script runs Marker first via its dedicated venv, then chunks the resulting markdown with `recursive` |

4. **Run the script**:
   ```
   python .claude/skills/chunking-large-files/scripts/chunk.py --input <path> --mode <mode> --chunk-size <n> [--out-dir <dir>]
   ```
   - Prints one JSON object to stdout: `mode`, `chunk_count`, `out_dir`, and each chunk's file path + `token_count`. A non-zero exit means a JSON error object on stderr (never a bare traceback) — read the `error` code, it tells you exactly what's wrong (`marker-not-installed`, `chunk-failed`, etc).
   - `--chunk-size` is in tokens (gpt2 tokenizer by default, `--tokenizer` to change) — size it to whatever the downstream worker call can comfortably take, typically 300-800.
   - Defaults to a sibling `<filename>.chunks/` directory if `--out-dir` isn't given.
5. **Delegate each chunk** (or the subset that matters) via `/delegate`: `ask-worker.mjs --role bulk --file <chunk_path> "<brief for this chunk>"`. Run chunks in parallel where the brief doesn't need chunks in sequence; keep them sequential if later chunks need earlier summaries as context.
6. **Aggregate** the per-chunk results yourself — this is the judgment step a worker can't do, since only you have the full picture across chunks.
7. **Clean up** the chunk output directory once delegation is done — these are scratch artifacts, not something to leave scattered in the repo.

## When NOT to use this skill

- The file already fits one `ask-worker.mjs --role bulk` call — chunking first just adds a round trip for nothing.
- You need to read specific, known line ranges (e.g. "look at lines 200-250") — use `Read` with `offset`/`limit` directly, this skill is for "I need to process the whole huge thing," not targeted lookups.
- Never use this to avoid delegating — it's a preprocessing step *before* `/delegate`, not a way to read a huge file into your own context chunk-by-chunk instead.

## Environment notes

- **Chonkie** (all modes) runs on the system Python (3.14) — already installed there, along with `tree-sitter-language-pack` (required for `code` mode).
- **Marker** needs Python 3.12 (its OCR/layout deps — `regex`, `Pillow` — don't yet have prebuilt wheels for 3.14, and compiling them needs MSVC Build Tools that aren't installed). It lives in an isolated venv at `~/.claude/venvs/marker`, kept out of the repo. The script shells out to `marker_single.exe` in that venv automatically for `.pdf`/`.docx`/`.pptx` inputs — you never need to activate it yourself.
- If `~/.claude/venvs/marker` is ever missing (fresh machine, moved user profile), the script fails fast with a `marker-not-installed` JSON error rather than a confusing traceback — recreate it with `py -3.12 -m venv ~/.claude/venvs/marker` then `pip install marker-pdf chonkie` inside it.

## Handoffs

- Chunks ready for summarization → `/delegate` (role `bulk`).
- Building an actual RAG ingestion pipeline (not just one-off Claude Code file processing) → `../../to read/web environment/00-overview-and-rag-pipeline.md` covers Chonkie/Marker's role there, which is a related but distinct use case from this skill.
