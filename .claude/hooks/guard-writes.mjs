// PreToolUse hook (Write|Edit): blocks edits to protected paths.
// Exit 2 = block; stderr becomes Claude's feedback. PostToolUse can't undo — that's why this is Pre.
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw.replace(/^﻿/, ''));
    const file = (input?.tool_input?.file_path || '').replace(/\\/g, '/');
    if (!file) process.exit(0);

    const blocked = [
      { re: /\/?\.env($|\.|\/)/i, why: 'environment secrets — edit manually' },
      { re: /\/?\.dev\.vars$/i, why: 'wrangler local secrets — edit manually' },
      { re: /\/drizzle\/.*\.sql$/i, why: 'generated migration — regenerate via drizzle-kit, never hand-edit' },
      { re: /package-lock\.json$/i, why: 'lockfile — changes come from npm, not edits' },
      { re: /\/?\.git\//, why: 'git internals' },
    ];

    for (const { re, why } of blocked) {
      if (re.test(file)) {
        console.error(`BLOCKED by guard-writes.mjs: "${file}" is protected (${why}). If this change is truly needed, ask the user to make it or to lift the guard.`);
        process.exit(2);
      }
    }
  } catch {
    // never block on parse failure
  }
  process.exit(0);
});
