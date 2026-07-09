// PreToolUse hook: blocks destructive commands before they run.
// Exit 2 + stderr = block the tool call and show Claude the reason.
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw.replace(/^\ufeff/, ''));
  } catch {
    process.exit(0);
  }
  const cmd = (input?.tool_input?.command ?? '').toLowerCase();
  if (!cmd) process.exit(0);

  const blocked = [
    { re: /drizzle-kit\s+push|db:push/, why: 'Schema pushes touch the live database. The user must run this himself after reviewing the generated SQL.' },
    { re: /drop\s+(table|database|schema)/, why: 'Destructive SQL is never run by the agent.' },
    { re: /git\s+push\s+(-f|--force)(\s|$)/, why: 'Force-pushing rewrites remote history. Ask the user to do it deliberately.' },
    { re: /git\s+reset\s+--hard/, why: 'Hard reset discards local work. Ask the user first.' },
    { re: /wrangler\s+(deploy|delete)/, why: 'Deploys go to production. The user deploys manually.' },
    { re: /curl\s/, why: 'Network requests require user approval. Explain what you need to fetch and ask the user to run it.' },
    { re: /wget\s/, why: 'Network requests require user approval. Explain what you need to fetch and ask the user to run it.' },
    { re: /npm\s+publish/, why: 'Publishing packages requires user approval.' },
    { re: /npx\s+wrangler/, why: 'Wrangler commands interact with production infrastructure. Ask the user.' },
  ];

  // rm -rf: block unless targeting known safe build artifact directories
  const rmMatch = cmd.match(/rm\s+-rf\s+(.+)/);
  if (rmMatch) {
    const target = rmMatch[1].trim();
    const safeTargets = [
      'node_modules', './node_modules',
      'dist', './dist',
      '.next', './.next',
      '.wrangler', './.wrangler',
      '.tanstack', './.tanstack',
      '.vinxi', './.vinxi',
      '.output', './.output',
    ];
    const isSafe = safeTargets.some((s) => target === s || target.startsWith(s + '/') || target.startsWith(s + '\\'));
    if (!isSafe) {
      console.error(`BLOCKED by .claude/hooks/guard-bash.mjs: Recursive delete outside build artifacts requires user confirmation. Target: ${target}`);
      process.exit(2);
    }
  }

  for (const { re, why } of blocked) {
    if (re.test(cmd)) {
      console.error(`BLOCKED by .claude/hooks/guard-bash.mjs: ${why}`);
      process.exit(2);
    }
  }
  process.exit(0);
});
