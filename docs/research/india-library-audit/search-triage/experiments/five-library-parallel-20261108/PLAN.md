# Five-library concurrent spike

The owner explicitly requested a bounded comparison with all five libraries running together. Main audit and hourly milestone watcher stay paused.

Use the same frozen five JNV2 members and fifty titles each (250 unique pairs). Use one Node process/event loop. Initialize five separate sessions concurrently; wait until all are ready, verify distinct session identifiers, then start all five groups of fifty search POSTs together. No artificial request-start spacing. Maximum 250 requests in flight; no repeat or ascending load tests. Honor current robots/crawl delays, source refusals and Retry-After. Cancel outstanding work on a genuine access/rate refusal. Keep the same 45-second request deadline as the prior benchmark; record timeouts honestly and do not automatically retry.

Each request body/session remains bound to one member and one term. Compare every result with the saved native IDs/titles/counts, correct member/query echo and punctuation-normalized Title relevance. Preserve all sanitized response bodies, evidence hashes, source timing, empty results and errors. Reference comparisons ignore harmless result ordering but preserve native identity. One earlier source-dated punctuation correction is explicit in the baseline provenance.

Measure initial setup time, wall time for the entire concurrent wave, each library completion time, actual peak concurrent requests, per-request median/p95 latency and network failures. Compare the whole wave with the prior sequential-library combined search time126.7seconds and active time155.5seconds. Do not sum overlapping library durations or claim an absolute provider capacity limit. Publish a scoped evidence checkpoint; do not activate sources, deploy, change the main collector or resume it.
