// PreToolUse hook: blocks destructive commands before they run.
// Exit 2 + stderr = block the tool call and show Claude the reason.
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw.replace(/^﻿/, ''));
  } catch {
    process.exit(0);
  }
  const cmd = (input?.tool_input?.command ?? '').toLowerCase();
  if (!cmd) process.exit(0);

  const blocked = [
    { re: /drizzle-kit\s+push|db:push/, why: 'Schema pushes touch the live Neon database. The user must run "npm run db:push" himself after reviewing the generated SQL.' },
    { re: /drop\s+(table|database|schema)/, why: 'Destructive SQL is never run by the agent.' },
    { re: /git\s+push\s+(-f|--force)(\s|$)/, why: 'Force-pushing rewrites remote history. Ask the user to do it deliberately.' },
    { re: /git\s+reset\s+--hard/, why: 'Hard reset discards local work. Ask the user first.' },
    { re: /rm\s+-rf\s+(?!node_modules|\.\/node_modules|dist|\.\/dist)/, why: 'Recursive delete outside build artifacts requires user confirmation.' },
    { re: /wrangler\s+(deploy|delete)/, why: 'Deploys go to production Cloudflare Workers. The user deploys manually.' },
  ];

  for (const { re, why } of blocked) {
    if (re.test(cmd)) {
      console.error(`BLOCKED by .claude/hooks/guard-bash.mjs: ${why}`);
      process.exit(2);
    }
  }
  process.exit(0);
});
