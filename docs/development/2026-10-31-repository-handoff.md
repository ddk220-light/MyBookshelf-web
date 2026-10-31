# Repository completeness audit

Date: 2026-10-31. Target: `ddk220-light/MyBookshelf-web`, branch `main`.
The owner selected this repository for all future MyBookshelf web work.

## Application baseline

Public HEAD and fetched `origin/main` both resolved to
`83b481d22a72525048051702ac562695299435d8` before this handoff. A fresh allowlisted
web export was produced outside the source checkout from the latest reviewed
implementation, solely to compare the files. The audit found:

- 433 exported web inputs, all present in the public repository.
- Zero missing files and zero extra tracked files relative to the export output.
- All files byte-identical except `package-lock.json`. The public lockfile is
  intentionally regenerated for the reduced web-only workspace dependencies;
  it is retained rather than restoring the retired auth/native dependencies.
- A second audit including bare side-effect imports found one earlier export
  omission: `server/index.js` imports `server/env.js`, which was missing. The
  environment loader is now included, so local start/dev commands work from
  either the repository root or server workspace. No secret values are in it.
  Startup logs report the actual listening port, including an OS-assigned port.
- A subprocess regression test starts the real local entrypoint and verifies
  health plus bundled library search. It runs in the normal server test command.
  Other relative client/server imports resolve. No package dependency, SEO
  publication or deployment configuration changes were needed.

The comparison covers the actual allowlisted web application, not all historical
branches or unrelated native/research files. The current app does not depend on
the private repository at runtime or during its documented build/test workflow.

## Recent work carried forward

- Account architecture, open-source auth comparison, private data/security model,
  guest sync, book identity research and infrastructure prerequisites.
- A durable backlog outline preserving the requested initial PRD/UX/engineering/UI
  planning and detailed task decomposition, account epics/stories and explicitly
  undefined future social scope. It distinguishes planned items from created issues.
- UI/SEO approved decisions, screen review, validation and original JSON reports.
- Claude's 131 HTML reference boards, three-light CSS and design/SEO review texts,
  with archived-proposal warnings and an index. Sample cover images are replaced
  by an original neutral SVG; private source history/design archives are excluded.
- Ten actual preview screenshots plus their six-screen geometry report. The full
  168-capture matrix can be regenerated using the existing visual-review script.
- Current handoff, docs index, agent instructions, credential setup/blocker notes
  and server-only environment variable example. No secret values are copied.

## Canonical repository maintenance

The obsolete `tools/release/export-web.py`, duplicated public README and duplicated
CI template are removed here. They described exporting from a larger private
checkout and would omit new documentation or expect inputs that are absent here.
Use the root README and `.github/workflows/web.yml` directly. `EXPORT.json` remains
as initial snapshot provenance; its file count is historical, not a current count.

Docs/design/evidence are excluded by `.vercelignore`; they do not become public
app routes or SEO pages. This handoff does not change the Vercel repository link,
production deployment, database, OAuth registrations or account runtime behavior.

See [../STATUS.md](../STATUS.md) for the next steps and dated deployment evidence.

## Handoff verification

The repository was installed independently with `npm ci` under Node 22.23.4.
Client type checking, production build, four SEO checks and the deployment
build-scope check passed. The build still produces nine library guides and
sixteen sitemap URLs. The complete server suite passes 485 tests, including the
new real-entrypoint startup regression; client verification passes 120 tests
across 23 files. This fresh count corrects the earlier 121-test summary.

All local Markdown links in the carried-forward docs resolve, all 131 reference
boards' local assets resolve, documentation JSON parses, and no relative source
imports are missing. Gitleaks reports no secrets in the proposed source tree.
The full browser suite was not repeated for this handoff: browser-facing code and
public assets are unchanged, and its prior successful CI evidence is preserved.
