// Stop hook: runs lint + typecheck when Claude tries to finish a task.
// Exit 2 blocks completion and feeds errors back — forces the model to fix.
// Guards against infinite loops via stop_hook_active flag.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw.replace(/^\ufeff/, ''));

    // Prevent infinite loops: if the stop hook already blocked once,
    // the model will retry — check if this is a re-entry.
    if (input?.stop_hook_active) {
      process.exit(0);
    }

    const cwd = input?.cwd ?? process.cwd();
    const errors = [];

    // 1. TypeScript typecheck (fast, catches most structural issues)
    try {
      execFileSync('npx', ['tsc', '--noEmit'], {
        cwd,
        stdio: 'pipe',
        shell: process.platform === 'win32',
        timeout: 60000,
      });
    } catch (e) {
      const output = e.stdout?.toString() || e.stderr?.toString() || '';
      // Only report if there are actual type errors, not warnings
      if (output.includes('error TS')) {
        errors.push(`TypeScript errors:\n${output.slice(0, 2000)}`);
      }
    }

    // 2. ESLint (catches unused imports, rule violations)
    try {
      execFileSync('npx', ['eslint', '--max-warnings=0', '--format=compact', '.'], {
        cwd,
        stdio: 'pipe',
        shell: process.platform === 'win32',
        timeout: 60000,
      });
    } catch (e) {
      const output = e.stdout?.toString() || e.stderr?.toString() || '';
      if (output.includes('Error') || output.includes('error')) {
        errors.push(`Lint errors:\n${output.slice(0, 2000)}`);
      }
    }

    if (errors.length > 0) {
      console.error(
        `BLOCKED by .claude/hooks/verify-on-stop.mjs — fix these before completing:\n\n${errors.join('\n\n')}`
      );
      process.exit(2);
    }
  } catch {
    // Parse failures or unexpected errors should not block the agent
  }
  process.exit(0);
});
