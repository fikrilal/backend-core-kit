const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const root = process.cwd();
const hooksPath = join(root, '.githooks');

if (!existsSync(join(root, '.git'))) {
  console.error('Git hooks can only be installed from a git worktree.');
  process.exit(1);
}

if (!existsSync(hooksPath)) {
  console.error(`Missing hooks directory: ${hooksPath}`);
  process.exit(1);
}

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
  cwd: root,
  stdio: 'inherit',
});

process.stdout.write('Configured git core.hooksPath=.githooks\n');
