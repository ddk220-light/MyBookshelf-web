# e-Granthalaya five-library batches

Owner-authorized continuation, 8 November 2026. This covers all **5,036 frozen e-Granthalaya library IDs**, with the 2,910 previously unchecked entries first. It preserves the original 6,703-library triage and older audit journals unchanged. Other catalog systems and old workers remain paused.

Each batch initializes an independent anonymous session for each of at most five libraries. It then sends fifty Title/Books searches per library concurrently, using the first fifty titles of the existing eighty-title seed pack. A session never crosses libraries. There is no item-detail request and no AI in the request/result loop. The native member, query echo, material and search controls are checked; every returned candidate, count, native ID/title/ISBN and session-dependent item URL is saved.

**Latest owner cadence:** minimum **60 seconds between batch starts**; always wait for all previous requests to settle before the next batch. Each request has a **180-second timeout**. Up to 250 client requests may be outstanding; this does not establish simultaneous server processing. At 1,008 batches, the minimum is 16 hours 48 minutes before setup, slow responses and publishing overhead. Fifty titles do not guarantee twenty books in every library.

The longer timeout is a deliberate recovery change from the spike's 45 seconds. That spike returned 132/250 matching responses and 118 timeouts. This run retains failures honestly. No automatic per-query retries. A real policy/access refusal or a batch with at least half its completed searches failing through timeout/transport/5xx pauses further load for review rather than sending thousands of identical failures.

## Execution and recovery

```sh
node tools/library-triage/egranthalaya-batch-run.mjs \
  --dir docs/research/india-library-audit/search-triage/egranthalaya-fifty-20261108 \
  --state-dir /workspace/library-audit-review/egranthalaya-fifty-supervisor --publish
```

Do not reinitialize. Inspect actual host/PID/start time/non-zombie command, advancing progress/heartbeat, remote freshness, root/run/machine locks before resuming the same command. Do not edit or commit through this worktree while the runner owns it. A `pause` file in its external state directory cooperatively interrupts provider work; SIGTERM also records interrupted attempts and releases only owned locks. Remove a pause only for a deliberate authorized resume. Finished query IDs are skipped, operator-cancelled queries remain resumable, source refusals persist. No lock is automatically stolen.

The single supervisor owns the provider loop and publishes only after all batch requests settle, retaining its exclusive machine/run reservation between batches. Five logical library jobs use asynchronous HTTP; five AI agents or five CPU processes are unnecessary. Every five-library checkpoint validates body hashes, reparses successful response evidence to reconcile saved records, regenerates CSVs, commits and pushes only this run directory. Changed remote history stops publication safely; never force-push. A disk guard stops below 2 GiB free.

Temporary Git fetch/push failures retry with backoff from 30 seconds to five minutes, with visible heartbeat and retry reason. A durable publication transaction recovers interrupted pushes without repeating searches or commits. Authentication failures and divergent Git history stop for repair; no force push is permitted. The hourly task now actively diagnoses, tests, repairs and resumes stopped work, and reports every hourly check while stopped. It publishes preserved results before sending new provider requests. Provider refusals still require useful review, not blind retries.

**No Vercel builds or deployments for analysis.** The committed `vercel.json` disables automatic deployments for this audit branch and `research/**`. Skip commit markers are insufficient. The publisher checks the committed rule before any fetch/push and refuses enabled overrides. Never invoke Vercel build/deploy/promote for research. See [build-cost incident and prevention](vercel-build-incident-20261110.json).

## Outputs

- [Progress](progress.json) and [per-library status](libraries.csv): current unique-ID totals. Pending is separate; old three-query outcomes are not counted as fresh fifty-query coverage.
- `batches/NNNN/`: frozen five-library manifest, segmented append-only JSONL, summary/validation, `libraries.csv`, `queries.csv`, `results.csv` (all returned candidates), `items.csv` (distinct relevant native bibliographic IDs), and `failures.csv`.
- Sanitized HTML is losslessly gzip-compressed in content-addressed `bodies/*.txt.gz`. References include both decompressed SHA256/bytes and stored-file SHA256/bytes. Decompress before inspecting; original CRLF bytes remain intact after the established secret redaction. This avoids tens of gigabytes of repeated form markup while keeping ordinary Git files.
- Root append-only events reference each batch's outcome IDs and hashes. `journal-index.json` lists every sealed/active segment; never read just events.jsonl after rollover.
- On completion: `final-report.md`, `final-report.json`, and `artifact-index.csv` linking and hashing every per-batch query/result/item/failure CSV. Large lists stay partitioned to avoid Git single-file limits.

**Working** means at least one relevant specific native bibliographic item returned in the selected member's Books search. Valid empty searches are separate from failed requests. Twenty distinct native bibliographic records are a sampling benchmark; duplicate IDs across queries never inflate the count. Edition/work deduplication is not inferred from similar titles. Item URLs are saved as session-dependent, not checked; no borrowability, app-path proof or deployment is implied. No app libraries are removed, hidden, disabled or activated.
