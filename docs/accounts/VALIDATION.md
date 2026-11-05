# Account validation evidence

## Current release — 2026-11-05

Email accounts are enabled in production. [RELEASE_ACCEPTANCE.md](RELEASE_ACCEPTANCE.md)
records exact source/deployment, full CI, actual received-mail workflows, multiple
devices, privacy/export/deletion, UI/assistive-technology evidence and measured load.
[PRODUCTION_ROLLOUT.md](PRODUCTION_ROLLOUT.md) records infrastructure and remaining
Neon retention/independent-operator checks. Google/Apple are explicitly deferred.
The owner has authorized deployment after clean checks; final project acceptance
stays open for the listed operational evidence.

## Historical implementation checkpoint — 2026-11-01

The sections below retain dated evidence for candidate
`56915a6785f26daa55b7ea684372a23875c136ee`, branch `account-settings`, PR #57.
They describe the earlier staging checkpoint; its former “remaining” entries are
superseded by the current release record. R02 approved Claude canvas v4 at
`36a1436`. The owner's later choices use Resend in production only and leave
Google/Apple disabled.

## Reproducible local checks

The UI/retry candidate above passed the checks below on a frozen client build.
The account lane uses a fresh harness for each browser profile, keeping actual
production rate limits enabled. [SCREEN_REVIEW.md](SCREEN_REVIEW.md) records the
artifact comparison and [the gallery](evidence/ui-review/index.html) separates
default phone typography from enlarged-text stress cases.

Node 22.23.4; PostgreSQL 18.6; migrations 001–011; npm lockfile v3.
Disposable loopback database, actual native auth/reading/worker roles, synthetic
accounts and books only. Start Postgres using [local instructions](../../tools/accounts/README.md).
Supply `ACCOUNT_TEST_DATABASE_URL` to enable DB integration; skipped DB tests do
not count as passing evidence. No hosted account or provider secrets enter CI.

| Check | Command / result |
| --- | --- |
| Clean dependencies | `npm ci`: pass |
| Types | `npm run typecheck:client`: pass |
| Client | `npm run test:client`: **143 passed**, 32 files |
| Server | `npm test --workspace server`: **514 passed, zero skipped**, including actual Postgres and isolated restore |
| Build | `npm run build`: pass; nine public guides/sixteen sitemap URLs |
| SEO | `npm run test:seo`: pass |
| Deployment contracts | `node --test tools/deployment/*.test.mjs`: pass |
| Dependencies | `npm audit`: **zero findings**; `npm ls`: clean |
| Public browsers | Chromium, mobile Chromium, WebKit: **318 passed** on the frozen candidate build; 24 account scenarios intentionally excluded in this lane |
| Account browsers | Same three projects, real local API/cookies/Postgres: **24 passed**; successful operations use real APIs/data, with deliberate network failures for recovery checks |
| Source hygiene | Whitespace, local documentation links and changed-file secret-pattern checks: pass |

Run the public Playwright lane with `ACCOUNT_E2E` unset. For account journeys,
build the client, start a fresh `ACCOUNT_E2E=true node tools/accounts/e2e-server.mjs`,
then run one profile:

```sh
ACCOUNT_E2E=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:4300 \
  npm run test:e2e --workspace client -- accounts-real.spec.js accounts-visual.spec.js \
  --project=chromium --workers=2
```

Restart the harness and repeat for `mobile-chromium` and `webkit`, as CI does.
Use `npx playwright install --with-deps chromium webkit` on supported CI hosts.
This workspace used system Chromium and Playwright 1.55.1 WebKit 26.0/build 2203.
Portable WebKit libraries lived under `/tmp`; the host dependency validator was
skipped because its system-library inventory cannot discover those local files.
The actual engine ran; application, network, cookie and TLS checks stayed enabled.
CI uses normal installed system dependencies. Desktop/mobile Chromium are distinct
viewport profiles; Playwright WebKit is not proof of real iOS Safari/provider login.

## Coverage and final-test status

The AC-01–17 mapping remains in [the approved test strategy](TEST_STRATEGY.md).
The following distinguishes completed automated evidence from mandatory live exits.

| Final task | Evidence available | Remaining required evidence |
| --- | --- | --- |
| T01 #42, auth/providers | Native signup/verification/reset/session/email-change tests; signed Google/Apple token fixtures validate PKCE/state/nonce/issuer/audience/signature, expiry/replay, relay/name preservation, intent owner/session binding, link collision, concurrent last-method unlink and transactional notice rollback | Actual received mail; live Google/Apple, cancellation/returning login, mobile Safari form POST and Apple relay |
| T02 #43, privacy/security | Actual forced RLS, missing context/pooled reuse/A-B isolation, non-owner grants, shared two-instance limiter, CSRF/origin/redirect/raw-route denial, deleting identity fences, no-store/noindex, proof expiry/replay and export omissions | Hosting/log-drain redaction/retention audit and live provider configuration |
| T03 #44, synchronization | Real DB save/remove/undo/clear/import/history/version/generation races, quota/pagination, retry receipts; two-browser refresh/revocation/switch, late-response rejection, memory-only caches, guest-lock/cleanup concurrency, uncertain sign-out and deletion response | Hosted two-device repeat on the selected deployment; full staged race checklist sign-off |
| T04 #45, accessibility/UI | Three lights, 320/390/768/1440px, 200% text and forced colors; 85 paired artifact/app entries per browser plus bottom settings captures; axe, long strings, actual pending/error/retry flows, Escape/focus restore and modal background controls inert; [screen review](SCREEN_REVIEW.md) and [gallery](evidence/ui-review/index.html) | Real VoiceOver/Safari and NVDA/Firefox (or agreed equivalent) |
| T05 #46, regression/resilience | Full public browser suite, catalog/server/client/SEO/deployment checks; auth/DB outage isolation, storage corruption/denial, lost responses, bounded hash queue, maximum import and 1,000-book boundaries; twenty-reader local HTTP load below | Hosted cold start/pool wait/worker freshness measurements, final staged outage/rollback rehearsal |
| T06 #47, lifecycle/operations | Owned coherent export; immediate deletion denial, ledger outage/retry/receipt recovery; fenced provider retries/ciphertext expiry; isolated real-Postgres restore suppresses deleted identity, preserves another reader's books, invalidates all restored authentication and reconstructs encrypted provider jobs | Actual provider revocation, running schedule/alerts, hosted snapshot restore/retention proof and second operator's drill |

Controlled provider responses use real signed fixture ID tokens and the pinned
library protocol. Browser account journeys use a loopback-only synthetic outbox
reader. Neither is evidence of real external provider access or mail delivery.
No critical/high local defect remains known after these checks; untested release
exits remain blocking rather than being classified as passing tests.

## UI comparison and failure recovery

All three browser profiles passed eight real-account journeys each. The visual
journey captures 85 paired entries across 33 named screen/state cases per profile,
plus twelve bottom-of-settings pairs and enlarged-text/forced-color images. The
curated gallery retains thirteen pairs and three labelled stress images; complete
matrix metadata for all three profiles is checked in alongside it. No measured
pixel-match score or live provider success is claimed.

This pass repaired card/form sizing, small-screen typography, reveal-button
padding, history controls and missing settings actions. It also repaired exact-ID
clear/import retries, success notices incorrectly shown as dialog errors, result
heading/document titles, equivalent-error focus and cross-tab appearance updates.
See the screen review for deliberate differences and reproduction details.

The first combined run exhausted the real sign-in limiter across browser profiles.
Fresh per-profile harnesses fix fixture isolation without changing production
limits. A standalone reproduction confirmed WebKit can retain stylesheet media
evaluation after repeated screenshot/resizes; the test reasserts normal screen
media and verifies actual responsive CSS before capture. A sign-out assertion now
waits for server acknowledgement after private UI clears. The final runs pass all
24 account journeys and 318 public scenarios.

## Load and resource evidence

`ACCOUNT_BENCHMARK=true node tools/accounts/benchmark.mjs` refuses hosted/non-test
databases. It creates twenty synthetic users through native auth, seeds 1,000 exact
saved references each, exercises HTTP session/owner checks plus all pagination,
and cleans its fixtures. The result includes queue time in HTTP latency.

Latest run: **400/400 HTTP 200**, p50 **127 ms**, p95 **219.7 ms**, maximum
**392.3 ms**, total **2747 ms**, initialization **90 ms**. Observed API-phase RSS
**234 MiB**; lifetime maximum including native password burst **263 MiB**.
The twenty-job password burst completed **10** and rejected **10** as busy in
**643 ms**, with no unexpected error. An earlier run without the overlapping
browser load measured p95 150.3 ms. These are dated local observations.


This is a local capacity check, not a production SLO or hosted cold-start claim.
Auth and reading pools each cap at four connections; pool wait is included rather
than separately instrumented. A real native twenty-job password burst exercises
the two-active/eight-waiting resource budget and reports busy rejection rather
than an unbounded queue. No production analytics or account/book metric labels
were introduced. Hosted worker lag and notification routing are still unverified.

## Real staging checks

- Project `prj_tlwAzT2LGtV1HDRfW7DzhiWWihFF`, Node 22/iad1; stable origin
  `https://mybookshelf-accounts-staging.vercel.app` and isolated preview credentials.
- Neon `bold-band-47854367` / `store_tVhnBuK6FDTErqQ5`: actual runtime roles/grants
  checked; migrations 001–011 names and SHA-256 checksums match the repository.
- Private independent ledger `store_Gs9zkvOMQteZihLA`: real SDK 2.4.0 immutable
  request/completion, encrypted revocation round trip, anonymous-read denial and
  synthetic-object cleanup passed. The export store exists but v1 does not use it.
- Staging Neon metadata reports the Free plan. Its actual backup retention window
  has not been independently proved; this metadata cannot pass DEC-08/T06.
- Code `61e461c` deployed READY as `dpl_6aCSQFbM8yQsjfM8pBWfzSGuzqtT`
  (`mybookshelf-accounts-staging-cxlcdpnxd-ddk220.vercel.app`). Protected stable-origin
  health and account capabilities returned HTTP 200. Capabilities are correctly
  false for email/Google/Apple until their configuration is complete. This smoke
  check does not prove a real hosted sign-in.

Blob 2.4.0 is pinned to retain the explicit-token private APIs without a newer
unused OIDC/CLI dependency chain carrying a vulnerable pinned transitive package.
Playwright 1.55.1 and a narrow shell-quote override remove remaining audit findings.
Native auth remains pinned to the reviewed Better Auth version.

## Defects corrected during validation

- Guest writes/cleanup now coordinate and re-read the authoritative browser shelf;
  concurrent tabs cannot silently overwrite a newly acknowledged guest save.
- Identity bootstrap no longer remounts a typed public search, purges the ordinary
  guest library display or disables explicit recovery on a corrupt guest shelf.
- Guest confirmed metadata updates preserve view timestamps; private metadata
  refresh does not create opt-in history events.
- Browser storage assertions now await acknowledged asynchronous saves/dialog
  completion or poll the confirmed removed-library write. The initial public run
  had timing failures. A later run had three WebKit navigation timeouts while the
  static bundle was being rebuilt; the final lane uses a frozen built bundle.
- Export handles slow/aborted connections; expiry purges mail ciphertext even
  without sender credentials; provider photos are not retained; breach screening
  covers native NFKC password equivalence; late deletion responses cannot replace
  a newer receipt. Destructive dialogs retain actionable errors and focus. Automatic deletion-status
  polling stops after twelve checks; manual checking remains available.
- The first new keyboard test assumed browser chrome could never receive focus
  from a native modal. The corrected assertion permits browser chrome while
  proving background application controls remain unreachable. Escape restoration,
  explicit consent and the complete deletion flow still pass on all three projects.

## Current rollout choices and remaining live checks

Deepak subsequently instructed: Resend only for production; Google/Apple disabled
for now, with credentials added later. A fresh protected staging capabilities check
returned HTTP 200 with `email:false`, `google:false`, `apple:false`.

- No staging Resend setup or staging mail legal consent is requested. Local
  controlled-mail tests remain valid automated evidence; real delivery must be
  verified during production setup before enabling email accounts for readers.
- Google/Apple code and protocol tests remain implemented. Real provider, mobile
  Safari and relay checks are deferred until those methods are enabled; they are
  not current staging activation prerequisites.
- The optional GitHub staging scheduler remains inactive. Its secret API returned
  403, but extra GitHub permission is not needed for coding or today's disabled
  staging state. A tested production scheduler/alerts is still required for live
  deletion deadlines and data expiry before accounts are enabled. GitHub Actions
  is one scheduling option, not an application requirement.
- Hosted backup lifetime (at most thirty days), isolated restore/second operator,
  remaining real assistive-technology/performance/logging checks and final R03 acceptance
  remain production exits. These require actual evidence, not a resource's plan name.

These owner-directed activation deferrals supersede the earlier request to supply
all provider/mail/scheduler prerequisites for staging now. No real terms were
accepted, no verification bypass/test inbox was deployed, and production remains
unchanged. See [OPERATIONS.md](OPERATIONS.md#owners-current-rollout-choices).
