import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./ignore-web-build.mjs', import.meta.url));

test('only skips documentation-only commits since the last successful web deployment', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'mybookshelf-build-scope-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Deployment test');
  git('config', 'user.email', 'deployment-test@example.invalid');
  for (const name of ['client', 'docs', 'server', 'data']) mkdirSync(join(directory, name));
  const commit = (path, content) => {
    writeFileSync(join(directory, path), content);
    git('add', path);
    git('commit', '-qm', path);
    return git('rev-parse', 'HEAD');
  };
  const base = commit('client/app.js', 'initial web');
  const docs = commit('docs/release.md', 'documentation change');
  const run = (previous, current) => spawnSync(process.execPath, [script], {
    cwd: join(directory, 'server'),
    env: { ...process.env, VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_PREVIOUS_SHA: previous, VERCEL_GIT_COMMIT_SHA: current },
    stdio: 'pipe',
  }).status;

  assert.equal(run(base, docs), 0);
  const web = commit('client/app.js', 'changed web');
  const laterDocs = commit('docs/release.md', 'later documentation change');
  assert.equal(run(docs, laterDocs), 1, 'an earlier undeployed web change still builds');
  assert.equal(run(web, laterDocs), 0);
  const api = commit('server/api.js', 'changed API');
  assert.equal(run(laterDocs, api), 1);
  const directoryReview = commit('data/library-presentation-reviews.json', '{"version":1}');
  assert.equal(run(api, directoryReview), 1, 'runtime directory corrections require a deployment');
  assert.equal(run('', api), 1, 'first deployments always build');
  assert.equal(run('a'.repeat(40), api), 1, 'unavailable shallow history builds safely');
});

test('analysis branches skip before Git history or repository access', () => {
  for (const branch of ['feat/library-connector-audit', 'research/free-content-discovery-expansion', 'research/nested/audit']) {
    const result = spawnSync(process.execPath, [script], {
      cwd: tmpdir(),
      env: { ...process.env, VERCEL_GIT_COMMIT_REF: branch, VERCEL_GIT_PREVIOUS_SHA: '', VERCEL_GIT_COMMIT_SHA: '' },
      stdio: 'pipe',
    });
    assert.equal(result.status, 0, branch);
  }
  for (const branch of ['main', 'feat/product-change', 'researcher-feature']) {
    const result = spawnSync(process.execPath, [script], {
      cwd: tmpdir(),
      env: { ...process.env, VERCEL_GIT_COMMIT_REF: branch, VERCEL_GIT_PREVIOUS_SHA: '', VERCEL_GIT_COMMIT_SHA: '' },
      stdio: 'pipe',
    });
    assert.equal(result.status, 1, branch);
  }
});
