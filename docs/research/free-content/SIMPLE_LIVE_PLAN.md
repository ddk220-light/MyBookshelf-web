# Simple free live discovery

Owner direction, 2026-11-03 (America/Los_Angeles): avoid a data store until a
specific requirement demonstrates its need. Current traffic is negligible.
This plan supersedes the shared Redis/cache/session architecture for the initial
paper release. Track [FCD10 #156](https://github.com/ddk220-light/MyBookshelf-web/issues/156).

## Product requirements

- Search one selected paper source live. General searches use OpenAlex;
  biomedical searches and PMCIDs use Europe PMC. The Sources sheet switches
  sources. Explicit selection never silently searches a different source.
- Show more carries the provider's paging token in a signed browser token.
  Opening a result resolves its native record directly at that provider.
- No new database, Redis account, paid integration, shared cache or stored search
  session. Existing account features/resources are outside this change.
- Direct arXiv/DOAJ automation stays off because its aggregate pacing rules need
  coordination across deployments. Offer searches on their source websites;
  these connectors do not block other paper sources.
- Keep current source identities, verified free-reading rules, credits, versions,
  separate translations, source errors and browser shelf behavior.

## Engineering design

One supported adapter is called per request, with bounded deadlines/response
sizes and no automatic retry/fan-out. OpenAlex also checks its free allowance
before its search or exact-record request. Client disconnects cancel work.

Signed cursors contain provider, native paging token, query/context hash, fixed
15-minute expiry and bounded recent-cursor history. They contain no API key,
result records or server-side session pointer. Query/type/access/language/source
changes, tampering, old shared-session cursors and expiry require a fresh search.
Provider URLs remain fixed inside adapters.

Each replay makes a live request. Upstream indexes can change between pages:
this version does not promise a frozen snapshot or global duplicate-free paging.
Deduplicate source keys within each page and loaded browser results. There are no
excess merged records to buffer. A page may be underfilled when some upstream
records fail kind/access checks, while still offering the next provider page.

Only verified free locations produce reading actions. Missing, stale or
contradictory evidence remains unclear. Failures never mean no free copy.

## Cost and limits

Europe PMC uses its public API. OpenAlex uses the existing server-only key;
verify its free allowance, accepted endpoint pricing and zero prepaid balance
before dispatch. Exhaustion, paid balances or unknown policy stop the request.
No paid fallback or paid infrastructure is introduced. Normal hosting usage
continues under the existing Vercel plan; future hosting costs are not guaranteed
to be zero.

Provider-side throttles are authoritative. Honor retry-after information and
show outages/limits distinctly. This profile makes no application-wide daily
quota guarantee. Request count, payload size, deadline and continuation depth
remain bounded without a database.

## Configuration and delivery

Keep the existing discovery flag and strong cursor signer. Enable Europe PMC
and optionally OpenAlex with its key. Remove Redis and per-source application
daily/minute budget variables from active setup. No client-exposed credentials
or database migration.

1. Revise plan/operations and supersede the blanket Redis gate (#86).
2. Implement direct search/detail requests and signed provider paging; remove
   obsolete Redis runtime/test scaffolding.
3. Adapt source selection, outbound source searches and coverage messaging.
4. Verify routing, cost guards, cursor tampering/restarts, errors/access,
   reading/saving, accessibility and real hosted flows, then release checked main.

Reconsider shared infrastructure only for a demonstrated requirement: an
aggregate-paced connector, measured traffic exceeding provider/hosting limits,
or a deliberate need for frozen merged search sessions. Document that requirement
and costs before selecting or provisioning a store.
