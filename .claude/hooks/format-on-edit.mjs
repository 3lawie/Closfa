// PostToolUse hook: runs ESLint --fix on TS/TSX files Claude just wrote or edited.
// Always exits 0 — formatting failures must never block the agent.
import { execFileSync } from 'node:child_process';

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw.replace(/^﻿/, ''));
    const file = input?.tool_input?.file_path ?? '';
    if (!/\.(ts|tsx)$/.test(file)) process.exit(0);
    execFileSync('npx', ['eslint', '--fix', '--no-warn-ignored', file], {
      cwd: input?.cwd ?? process.cwd(),
      stdio: 'ignore',
      shell: process.platform === 'win32',
      timeout: 30000,
    });
  } catch {
    // lint errors or timeouts are non-fatal here; the lint step in review catches them
  }
  process.exit(0);
});
