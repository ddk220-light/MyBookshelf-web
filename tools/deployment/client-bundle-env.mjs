// The client bundle must carry only the build values the app reads by name
// (vite.config.js `define` and the VITE_* keys in client/src/vite-env.d.ts).
// Vercel exposes its system variables to Vite builds as VITE_VERCEL_*; when
// code uses `import.meta.env` as a whole object (a default parameter, a
// spread, Object.keys, `import.meta.env[key]`), Vite inlines every one of
// them: the private repository's name, commit SHAs and author, project and
// deployment IDs and *.vercel.app addresses.
//
//   node tools/deployment/client-bundle-env.mjs [client/dist]
// scans a built bundle; check-client-service-build.mjs builds with FAKE_BUILD_ENV
// and scans the result.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = '0123456789abcdef0123456789abcdef01234567';
// The production repository's name, built so the public export does not carry it.
const privateRepository = ['MyBookshelf', 'private'].join('-');
const base = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  VERCEL_URL: 'leakcheck-deploy.vercel.app',
  VERCEL_BRANCH_URL: 'leakcheck-branch.vercel.app',
  VERCEL_PROJECT_PRODUCTION_URL: 'leakcheck-production.vercel.app',
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_SLUG: privateRepository,
  VERCEL_GIT_REPO_OWNER: 'leakcheck-owner',
  VERCEL_GIT_REPO_ID: '987654321',
  VERCEL_GIT_COMMIT_REF: 'leakcheck-branch-ref',
  VERCEL_GIT_COMMIT_SHA: sha,
  VERCEL_GIT_PREVIOUS_SHA: 'fedcba9876543210fedcba9876543210fedcba98',
  VERCEL_GIT_COMMIT_MESSAGE: 'leakcheck commit message',
  VERCEL_GIT_COMMIT_AUTHOR_LOGIN: 'leakcheck-author-login',
  VERCEL_GIT_COMMIT_AUTHOR_NAME: 'Leakcheck Author Name',
  VERCEL_GIT_PULL_REQUEST_ID: '424242',
  VERCEL_PROJECT_ID: 'prj_leakcheck',
  VERCEL_DEPLOYMENT_ID: 'dpl_leakcheck',
  VERCEL_ORG_ID: 'team_leakcheck',
};

/** Vercel-like build variables, also with the VITE_ prefix Vercel adds for Vite projects. */
export const FAKE_BUILD_ENV = Object.freeze({
  ...base,
  ...Object.fromEntries(Object.entries(base).map(([key, value]) => ['VITE_' + key, value])),
});

/** The one value that may appear: the 7-character version (vite.config.js buildVersion). */
export const ALLOWED_VERSION = sha.slice(0, 7);

const leakValues = [...new Set(Object.entries(base)
  .filter(([key]) => !['VERCEL', 'VERCEL_ENV', 'VERCEL_GIT_PROVIDER'].includes(key))
  .map(([, value]) => value))];

/** Strings that must never be in a client bundle (real builds and fake-env builds). */
export const FORBIDDEN = Object.freeze([privateRepository, 'VERCEL_GIT', 'VERCEL_PROJECT', 'VERCEL_DEPLOYMENT', 'VERCEL_ORG', 'prj_', 'team_', 'dpl_', '.vercel.app']);

const textFile = /\.(?:m?js|css|html|json|map|txt|xml|webmanifest|svg)$/i;

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Every forbidden string (and fake value, when `fakeValues`) found in a built directory. */
export function findBundleLeaks(dir, { fakeValues = false } = {}) {
  const needles = fakeValues ? [...FORBIDDEN, ...leakValues] : [...FORBIDDEN];
  const found = [];
  for (const path of files(dir).filter(path => textFile.test(path))) {
    const text = readFileSync(path, 'utf8');
    for (const needle of needles) if (text.includes(needle)) found.push({ file: relative(dir, path), needle });
  }
  return found;
}

/** Whole-object uses of import.meta / import.meta.env in client source (comments ignored). */
export function wholeEnvUses(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  const uses = [];
  const pattern = /import\.meta(?!\.env\.[A-Za-z_$][\w$]*|\.url\b|\.glob\b|\.hot\b)/g;
  for (const match of code.matchAll(pattern)) uses.push(code.slice(0, match.index).split('\n').length);
  return uses;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || fileURLToPath(new URL('../../client/dist', import.meta.url));
  const leaks = findBundleLeaks(dir, { fakeValues: true });
  for (const { file, needle } of leaks) console.error(`${file}: contains ${JSON.stringify(needle)}`);
  if (leaks.length) process.exit(1);
  console.log(`No build-host variables found in ${dir}.`);
}
