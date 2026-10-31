"""Export the current web app without private Git history or retired account UI.

Runtime data snapshots are build inputs. Original data/licence notices accompany
those snapshots; the private research corpus is not required to run this app.
"""
from pathlib import Path
import shutil, sys, re, json, subprocess
root=Path(__file__).resolve().parents[2]
out=Path(sys.argv[1]).resolve()
if out.exists(): raise SystemExit('Destination must not exist')
if root == out or root in out.parents: raise SystemExit('Export outside source repository')
out.mkdir(parents=True)
files=set()
def add(path):
 p=root/path
 if p.is_dir():
  for f in p.rglob('*'):
   if f.is_file() and not any(x in f.parts for x in ['node_modules','dist','test-results','__pycache__','.git']): files.add(f.relative_to(root))
 elif p.is_file(): files.add(Path(path))
 else: raise RuntimeError('Missing export input: '+str(path))
for path in ['LICENSE','NOTICE','CONTRIBUTING.md','SECURITY.md','.gitignore','.vercelignore','.nvmrc','.npmrc','package.json','package-lock.json','vercel.json','shared','client/src/v2','client/src/main.tsx','client/src/test/setup.js','client/public-app','client/e2e','client/package.json','client/index.html','client/vite.config.js','client/vitest.config.js','client/playwright.config.js','client/tsconfig.json','client/tailwind.config.js','client/postcss.config.js','tools/seo','tools/deployment','tools/release','data/LICENSE','data/india-administrative-aliases.json','data/library-presentation-reviews.json','data/library-selection-aliases.json','data/india-place-sources.json','data/india-location-coverage.json','.github/ISSUE_TEMPLATE']:
 if (root/path).exists(): add(path)
# Walk local module imports from the anonymous server's actual entry points.
pending=[Path(p) for p in ['server/index.js','server/vercel.js','server/anonymousApp.js']]
while pending:
 path=pending.pop()
 if path in files: continue
 add(path)
 if path.suffix!='.js': continue
 text=(root/path).read_text()
 for spec in re.findall(r'''(?:from\s*|import\s*\()(['"])(\.[^'"]+)\1''',text):
  dest=(root/path.parent/spec[1]).resolve().relative_to(root)
  if dest not in files: pending.append(dest)
# Test only the exported modules, keeping sample fixtures separate from licensing
# of original code. Legacy account/database tests and native app code are absent.
for path in list(files):
 if path.suffix=='.js':
  candidate=path.with_name(path.stem+'.test.js')
  if (root/candidate).exists(): add(candidate)
add('server/public-v2')
add('server/services/providers')
add('server/test/fixtures')
add('server/test/helpers.js')
add('testdata/calil')
add('server/package.json')
add('server/vercel.test.js')
for path in sorted(files):
 if path.name.startswith('.env') or path.suffix in ['.db','.jks','.keystore']: raise RuntimeError('Sensitive export path')
 dest=out/path;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/path,dest)
# Public API tests require only a JSON test app; do not export legacy DB helpers.
(out/'server/test/helpers.js').write_text('import express from \"express\";\nexport function makeTestApp(configure) { const app=express(); app.use(express.json()); configure(app); return app; }\n')
# Captured third-party scripts are unnecessary for the empty-result parser test.
fixture=out/'server/test/fixtures/discovery-academic/nios-empty.html'
clean=re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', fixture.read_text(), flags=re.I)
clean=re.sub(r'(?i)((?:key|tokenid)=)[^&\s\"<>]+', r'\1redacted-fixture-value', clean)
fixture.write_text(clean)
# The public app does not use the retired auth/database package dependencies.
p=out/'server/package.json';d=json.loads(p.read_text())
for name in ['argon2','better-sqlite3','cookie-parser','multer']: d['dependencies'].pop(name,None)
d['scripts']['test']='node --test --test-reporter=spec anonymousApp.test.js vercel.test.js public-v2/*.test.js services/*.test.js services/providers/*.test.js'
p.write_text(json.dumps(d,indent=2)+'\n')
p=out/'package.json';d=json.loads(p.read_text());d['scripts'].pop('check:directory',None);d['scripts'].pop('test:directory',None);p.write_text(json.dumps(d,indent=2)+'\n')
(out/'README.md').write_text((root/'tools/release/PUBLIC_README.md').read_text())
(out/'.github/workflows').mkdir(parents=True,exist_ok=True)
shutil.copyfile(root/'tools/release/public-ci.yml',out/'.github/workflows/web.yml')
# Publish only web-maintenance instructions; no private repo history/team IDs.
(out/'CLAUDE.md').write_text('''# MyBookshelf web app\n\nNode 22, npm workspaces, React/Vite client and Express anonymous API.\nUse README.md for commands. Run client/server tests, type checking, build, SEO\nchecks and browser journeys before releasing. Provider keys stay server-side.\nThe full directory remains usable in the app; shared/seo-libraries.json controls\nonly public library pages. Never treat failed checks as absence or merge editions\nfrom similar titles. Respect catalog access restrictions and reduced motion.\n''')
(out/'EXPORT.json').write_text(json.dumps({'source':'reviewed web application snapshot','licence':'AGPL-3.0-only','files':len(files)},indent=2)+'\n')
print(f'Exported {len(files)} files to {out}')
