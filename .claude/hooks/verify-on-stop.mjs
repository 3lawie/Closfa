// Stop hook: quality gate before Claude finishes a task.
// Exit 2 blocks completion and feeds errors back — a deterministic validator loop.
// Scoped to CHANGED files only: a Q&A session with no edits never runs tools, and
// pre-existing repo lint drift can't block unrelated work.
// Loop guard: stop_hook_active (Claude Code force-overrides after 8 consecutive blocks anyway).
import { execFileSync } from 'node:child_process';

function run(cmd, args, cwd, timeout = 90000) {
  return execFileSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    timeout,
  }).toString();
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw.replace(/^﻿/, ''));
    if (input?.stop_hook_active) process.exit(0);
    const cwd = input?.cwd ?? process.cwd();

    // Collect changed source files (staged + unstaged + untracked)
    let changed = [];
    try {
      const tracked = run('git', ['diff', '--name-only', 'HEAD'], cwd);
      const untracked = run('git', ['ls-files', '--others', '--exclude-standard'], cwd);
      changed = [...tracked.split('\n'), ...untracked.split('\n')]
        .map((f) => f.trim())
        .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f) && !f.startsWith('.claude/'));
    } catch {
      process.exit(0); // not a git repo — nothing to gate
    }
    if (changed.length === 0) process.exit(0); // nothing was edited: no gate, no cost

    const errors = [];

    // 1. Typecheck — project-wide (types are interconnected), but only when something changed
    try {
      run('npx', ['tsc', '--noEmit'], cwd, 120000);
    } catch (e) {
      const out = e.stdout?.toString() || e.stderr?.toString() || '';
      if (out.includes('error TS')) errors.push(`TypeScript errors:\n${out.slice(0, 2000)}`);
    }

    // 2. ESLint — changed files only (pre-existing drift elsewhere is not this task's problem)
    try {
      run('npx', ['eslint', '--max-warnings=0', '--format=compact', ...changed.slice(0, 30)], cwd, 90000);
    } catch (e) {
      const out = e.stdout?.toString() || e.stderr?.toString() || '';
      if (/error/i.test(out)) errors.push(`Lint errors in changed files:\n${out.slice(0, 2000)}`);
    }

    if (errors.length > 0) {
      console.error(`BLOCKED by verify-on-stop.mjs — fix before completing:\n\n${errors.join('\n\n')}`);
      process.exit(2);
    }
  } catch {
    // unexpected failures never block the agent
  }
  process.exit(0);
});
