import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_VERSION, FAKE_BUILD_ENV, findBundleLeaks, wholeEnvUses } from './client-bundle-env.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

function sources(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return /\.(?:[cm]?[jt]sx?)$/.test(name) && !/\.test\.[jt]sx?$/.test(name) ? [path] : [];
  });
}

test('client code reads build values by name, never import.meta.env as a whole', () => {
  // A whole-object use makes Vite inline every VITE_* variable of the build
  // host, including Vercel's repository, commit and project details.
  const found = [...sources(join(root, 'client/src')), ...sources(join(root, 'shared'))]
    .flatMap(path => wholeEnvUses(readFileSync(path, 'utf8')).map(line => `${path.slice(root.length)}:${line}`));
  assert.deepEqual(found, []);
});

test('whole-object detection', () => {
  assert.deepEqual(wholeEnvUses('const a = import.meta.env.VITE_APP_VERSION; new URL("x", import.meta.url);'), []);
  assert.deepEqual(wholeEnvUses('// passing `import.meta.env` inlines it\n/* import.meta.env */ x'), []);
  assert.deepEqual(wholeEnvUses('function f(e = import.meta.env) {}'), [1]);
  assert.deepEqual(wholeEnvUses('\nconst e = { ...import.meta.env };'), [2]);
  assert.deepEqual(wholeEnvUses('Object.keys(import.meta.env)'), [1]);
  assert.deepEqual(wholeEnvUses('import.meta.env[key]'), [1]);
  assert.deepEqual(wholeEnvUses('const m = import.meta; m.env.X'), [1]);
});

test('bundle scan finds host variables and allows the short version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-env-'));
  try {
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets/ok.js'), `const v={VITE_APP_VERSION:${JSON.stringify(ALLOWED_VERSION)}};`);
    assert.deepEqual(findBundleLeaks(dir, { fakeValues: true }), []);
    writeFileSync(join(dir, 'assets/leak.js'), `const e=${JSON.stringify({ VITE_VERCEL_GIT_REPO_SLUG: FAKE_BUILD_ENV.VITE_VERCEL_GIT_REPO_SLUG, VITE_VERCEL_GIT_COMMIT_AUTHOR_LOGIN: FAKE_BUILD_ENV.VERCEL_GIT_COMMIT_AUTHOR_LOGIN })};`);
    const needles = findBundleLeaks(dir, { fakeValues: true }).map(leak => leak.needle);
    for (const needle of [FAKE_BUILD_ENV.VERCEL_GIT_REPO_SLUG, 'VERCEL_GIT', FAKE_BUILD_ENV.VERCEL_GIT_COMMIT_AUTHOR_LOGIN]) assert.ok(needles.includes(needle), needle);
    writeFileSync(join(dir, 'assets/leak.js'), 'const p="prj_abc",t="team_abc",u="x.vercel.app";');
    assert.deepEqual(findBundleLeaks(dir).map(leak => leak.needle).sort(), ['.vercel.app', 'prj_', 'team_']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
