import { spawnSync } from 'node:child_process';

// Analysis checkpoints must never compile an app, even without deployment history.
// git.deploymentEnabled prevents deployment creation; this is a second guard.
const branch = process.env.VERCEL_GIT_COMMIT_REF || '';
if (branch === 'feat/library-connector-audit' || branch.startsWith('research/')) {
  console.log('Skipping analysis branch: ' + branch);
  process.exit(0);
}

// Vercel skips a build on exit 0. Compare with the last successful deployment,
// so a documentation-only last commit cannot hide an earlier, undeployed web change.
const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
const current = process.env.VERCEL_GIT_COMMIT_SHA;
if (!/^[a-f\d]{40,64}$/i.test(previous || '') || !/^[a-f\d]{40,64}$/i.test(current || '')) {
  console.log('Building web: no complete deployment history.');
  process.exit(1);
}

const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
if (root.status !== 0) process.exit(1);
const result = spawnSync('git', [
  'diff', '--quiet', previous, current, '--',
  'client', 'server', 'package.json', 'package-lock.json', '.npmrc', '.nvmrc',
  'vercel.json', '.vercelignore', 'tools/deployment', 'tools/seo', 'shared',
  'data/india-administrative-aliases.json', 'data/library-presentation-reviews.json', 'data/library-selection-aliases.json',
], { cwd: root.stdout.trim(), stdio: 'ignore' });
console.log(result.status === 0 ? 'Skipping web: only unrelated files changed.' : 'Building web: relevant changes or unavailable history.');
process.exit(result.status === 0 ? 0 : 1);
