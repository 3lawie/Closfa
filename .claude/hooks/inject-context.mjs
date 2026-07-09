// SessionStart hook: injects project context into the conversation at session start.
// Outputs to stdout — Claude receives this text as initial context without using instruction tokens.
import { execFileSync } from 'node:child_process';

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const sections = [];

try {
  // Current branch
  const branch = execFileSync('git', ['branch', '--show-current'], {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    timeout: 5000,
  }).toString().trim();
  sections.push(`Branch: ${branch}`);
} catch { /* not a git repo or git unavailable */ }

try {
  // Recent commits (last 5, one-line format)
  const log = execFileSync('git', ['log', '--oneline', '-5'], {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    timeout: 5000,
  }).toString().trim();
  if (log) sections.push(`Recent commits:\n${log}`);
} catch { /* skip */ }

try {
  // Staged changes summary
  const staged = execFileSync('git', ['diff', '--staged', '--stat'], {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    timeout: 5000,
  }).toString().trim();
  if (staged) sections.push(`Staged changes:\n${staged}`);
} catch { /* skip */ }

try {
  // Unstaged changes summary
  const unstaged = execFileSync('git', ['diff', '--stat'], {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    timeout: 5000,
  }).toString().trim();
  if (unstaged) sections.push(`Unstaged changes:\n${unstaged}`);
} catch { /* skip */ }

try {
  // Untracked files (new files not yet added)
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    timeout: 5000,
  }).toString().trim();
  if (untracked) {
    const files = untracked.split('\n').slice(0, 10);
    sections.push(`Untracked files (first 10):\n${files.join('\n')}`);
  }
} catch { /* skip */ }

if (sections.length > 0) {
  console.log(`--- Project Context (auto-injected) ---\n${sections.join('\n\n')}\n---`);
}

process.exit(0);
