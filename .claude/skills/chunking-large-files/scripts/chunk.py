#!/usr/bin/env python3
"""Split a large text/code file, or a PDF/DOCX/PPTX (converted via Marker first),
into Chonkie chunks written to numbered files on disk.

Run with the system Python (chonkie + tree-sitter-language-pack are installed
there). PDF/DOCX/PPTX inputs are shelled out to the dedicated Marker venv
(see MARKER_PYTHON below) since Marker's OCR/layout deps need Python 3.12.

Usage:
  python chunk.py --input <path> [--mode auto|token|sentence|recursive|code|semantic]
                   [--chunk-size 512] [--tokenizer gpt2] [--language auto]
                   [--out-dir <dir>]

Prints one JSON object to stdout on success: mode used, chunk count, output dir,
per-chunk file list and token counts. Non-zero exit + a JSON error object on stderr
on failure — never a bare traceback the caller has to parse.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

MARKER_PYTHON = Path.home() / ".claude" / "venvs" / "marker" / "Scripts" / "python.exe"

CODE_LANGUAGES = {
    ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".jsx": "jsx",
    ".py": "python", ".go": "go", ".rs": "rust", ".java": "java",
    ".rb": "ruby", ".c": "c", ".cpp": "cpp", ".cs": "c_sharp", ".php": "php",
}
PROSE_EXTENSIONS = {".md", ".txt", ".rst", ".mdx"}
DOC_EXTENSIONS = {".pdf", ".docx", ".pptx"}


def fail(code: str, message: str, **extra) -> None:
    print(json.dumps({"error": code, "message": message, **extra}), file=sys.stderr)
    sys.exit(2)


def convert_with_marker(input_path: Path, workdir: Path) -> Path:
    if not MARKER_PYTHON.exists():
        fail(
            "marker-not-installed",
            f"Marker's venv is missing at {MARKER_PYTHON}. PDFs/DOCX/PPTX can't be "
            "converted without it — see the skill's SKILL.md for setup, or convert "
            "this file to text/markdown yourself before chunking.",
        )
    out_dir = workdir / "marker_out"
    out_dir.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [str(MARKER_PYTHON.parent / "marker_single.exe"), str(input_path),
         "--output_dir", str(out_dir), "--output_format", "markdown"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        fail("marker-failed", "Marker conversion failed.", stderr=result.stderr[-2000:])
    md_files = list(out_dir.rglob("*.md"))
    if not md_files:
        fail("marker-no-output", "Marker ran but produced no markdown file.", stderr=result.stderr[-2000:])
    return md_files[0]


def build_chunker(mode: str, chunk_size: int, tokenizer: str, language: str):
    from chonkie import TokenChunker, SentenceChunker, RecursiveChunker, CodeChunker, SemanticChunker

    if mode == "token":
        return TokenChunker(tokenizer=tokenizer, chunk_size=chunk_size)
    if mode == "sentence":
        return SentenceChunker(tokenizer=tokenizer, chunk_size=chunk_size)
    if mode == "recursive":
        return RecursiveChunker(tokenizer=tokenizer, chunk_size=chunk_size)
    if mode == "code":
        return CodeChunker(tokenizer=tokenizer, chunk_size=chunk_size, language=language)
    if mode == "semantic":
        # First call downloads a small static embedding model (minishlab/potion-base-32M,
        # CPU-only, no API key) — expect a one-time delay.
        return SemanticChunker(chunk_size=chunk_size)
    fail("unknown-mode", f"Unrecognized chunking mode: {mode}")


class MergedChunk:
    __slots__ = ("text", "token_count")

    def __init__(self, text: str, token_count: int):
        self.text = text
        self.token_count = token_count


def coalesce_chunks(chunks, chunk_size: int):
    """Greedily merge consecutive small chunks up to chunk_size.

    CodeChunker in particular emits one chunk per tree-sitter syntax node
    without merging siblings (a lone closing brace or import line becomes
    its own 1-2 token chunk) — this collapses those back into
    chunk_size-sized units so downstream delegation isn't spammed with
    near-empty chunks.
    """
    if not chunks:
        return chunks
    merged = [MergedChunk(chunks[0].text, chunks[0].token_count)]
    for c in chunks[1:]:
        if merged[-1].token_count + c.token_count <= chunk_size:
            merged[-1].text += c.text
            merged[-1].token_count += c.token_count
        else:
            merged.append(MergedChunk(c.text, c.token_count))
    return merged


def resolve_mode(mode: str, ext: str, came_from_marker: bool) -> str:
    if mode != "auto":
        return mode
    if came_from_marker:
        return "recursive"
    if ext in CODE_LANGUAGES:
        return "code"
    if ext in PROSE_EXTENSIONS:
        return "recursive"
    return "token"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--mode", default="auto",
                         choices=["auto", "token", "sentence", "recursive", "code", "semantic"])
    parser.add_argument("--chunk-size", type=int, default=512)
    parser.add_argument("--tokenizer", default="gpt2")
    parser.add_argument("--language", default="auto")
    parser.add_argument("--out-dir", type=Path, default=None)
    args = parser.parse_args()

    if not args.input.exists():
        fail("input-not-found", f"No such file: {args.input}")

    out_dir = args.out_dir or (args.input.parent / f"{args.input.stem}.chunks")
    out_dir.mkdir(parents=True, exist_ok=True)

    ext = args.input.suffix.lower()
    came_from_marker = False
    if ext in DOC_EXTENSIONS:
        source_path = convert_with_marker(args.input, out_dir)
        came_from_marker = True
    else:
        source_path = args.input

    try:
        text = source_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        fail("read-failed", f"Could not read {source_path}: {e}")

    mode = resolve_mode(args.mode, ext, came_from_marker)
    language = CODE_LANGUAGES.get(ext, "auto") if args.language == "auto" else args.language

    try:
        chunker = build_chunker(mode, args.chunk_size, args.tokenizer, language)
        chunks = chunker.chunk(text)
        chunks = coalesce_chunks(chunks, args.chunk_size)
    except Exception as e:
        fail("chunk-failed", f"Chonkie chunking failed in mode '{mode}': {e}")

    ext_out = ".md" if (came_from_marker or mode in ("recursive", "sentence")) else ".txt"
    files = []
    for i, chunk in enumerate(chunks, start=1):
        chunk_path = out_dir / f"chunk_{i:04d}{ext_out}"
        chunk_path.write_text(chunk.text, encoding="utf-8")
        files.append({"file": str(chunk_path), "token_count": chunk.token_count})

    print(json.dumps({
        "mode": mode,
        "source": str(args.input),
        "converted_via_marker": came_from_marker,
        "chunk_count": len(files),
        "out_dir": str(out_dir),
        "files": files,
    }))


if __name__ == "__main__":
    main()
