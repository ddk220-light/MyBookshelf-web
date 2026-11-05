# Production acceptance evidence — 2026-11-05 UTC

Read [release acceptance](../../../RELEASE_ACCEPTANCE.md) for exact release sources,
CI, workflow results, intentional deferrals and unverified operational exits.
These are dated observations from the real canonical production site and a
separate, explicitly identified local load/accessibility fixture.

| Light | Phone 390px, 100% text | Desktop 1440px | Bottom controls |
| --- | --- | --- | --- |
| Daylight | [Phone](production-settings-daylight-390.png) | [Desktop](production-settings-daylight-1440.png) | [Phone bottom](production-settings-daylight-390-bottom.png), [desktop bottom](production-settings-daylight-1440-bottom.png) |
| Lamplight | [Phone](production-settings-lamplight-390.png) | [Desktop](production-settings-lamplight-1440.png) | [Phone bottom](production-settings-lamplight-390-bottom.png), [desktop bottom](production-settings-lamplight-1440-bottom.png) |
| Ink | [Phone](production-settings-ink-390.png) | [Desktop](production-settings-ink-1440.png) | [Phone bottom](production-settings-ink-390-bottom.png), [desktop bottom](production-settings-ink-1440-bottom.png) |

Images use CSS-pixel scale; mailbox aliases are masked. Live measurements report
28px phone headings and 16px body/input text. The full Claude-v4 reference/state
comparison is in [the existing paired gallery](../../ui-review/index.html).
[Final production deletion receipt](production-deletion-final-mobile.png) shows
the durable receipt with both misleading notices removed. The earlier
[intermediate receipt](production-deletion-confirmed-mobile.png) retains the generic
sign-in prompt that screenshot review caught and PR #176 then removed.
These live settings screenshots were captured during the enabled release
acceptance before the final deletion-state repair; its receipt repeat is recorded
in the release report and browser results.

- `workflow-results.json`: native production signup/verification/recovery checks.
- `browser-results.json`: selected sanitized production acceptance results; setup
  diagnostics and page-text dumps are omitted.
- `db-results.json`: read-only scoped fixture/mail/cleanup counts and aggregate job
  freshness. No credentials or private rows are included.
- `reading-erasure-results.json`: scoped before/after owned reading/auth counts;
  the second production fixture had one saved book and one history entry before
  deletion, then all owned rows were absent after native-worker cleanup.
- `git-link-result.json`: actual saved repository link before/after and unchanged
  checked build/protection settings.
- `at-chromium-transcript.json`: actual Orca/AT-SPI generated speech text, with its
  exact local browser/source and explicit equivalent/engine limitations.
- `maintenance-teardown.json`, `webkit-rerun.json`: original CI failures, actual
  repair/repeated-case evidence and final rerun status; failures are not erased.
- `recovery-drill.json`: actual temporary local Postgres/auth/queue, retained-key
  failure/recovery, draining, explicit invalidation and new-key mail; controlled
  transport, temporary database removed, production secrets untouched.
- `benchmark.json`, `pool-acquisition.json`: disposable loopback API/Postgres only;
  no hosted cold-start or capacity guarantee.

No passwords, cookies, one-use links, deletion capabilities, mailbox aliases,
export contents or raw provider/browser logs are retained here. Failed exploratory
attempts are not counted as successful verification; the release report records
material limitations rather than claiming every attempt passed.
