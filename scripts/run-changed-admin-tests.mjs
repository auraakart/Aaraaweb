import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const [base, head, ...extra] = process.argv.slice(2);
if (!base || !head || extra.length) {
  console.error('Usage: node scripts/run-changed-admin-tests.mjs <base commit> <head commit>');
  process.exit(2);
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
for (const ref of [base, head]) git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`);
const root = git('rev-parse', '--show-toplevel').trim();
const tests = git('diff', '--name-only', '-z', '--diff-filter=ACMR', base, head, '--', 'apps/admin/tests/admin-ui/')
  .split('\0').filter(path => path.endsWith('.spec.mjs'));
if (!tests.length) {
  console.log('No changed Admin browser specs; full browser regression remains required.');
  process.exit(0);
}
for (const path of tests) {
  if (!existsSync(join(root, path))) throw new Error(`Changed Admin spec is missing from the checkout: ${path}`);
}
// Playwright's positional filters are regular expressions. Pass literal file
// paths as separate arguments; filenames cannot widen or suppress selection.
const patterns = tests.map(path => path.replace(/^apps\/admin\//, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
console.log(`Run ${tests.length} changed Admin browser spec(s) before full regression.`);
const result = spawnSync('pnpm', ['exec', 'playwright', 'test', ...patterns, '--max-failures=1'], {
  cwd: join(root, 'apps/admin'), stdio: 'inherit',
});
if (result.error) console.error(`Changed Admin tests could not start: ${result.error.message}`);
process.exit(result.status ?? 1);
