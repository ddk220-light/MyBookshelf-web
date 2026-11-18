# Root causes: library checks

Read from the code on 19 November 2026; nothing was changed, and no request was made to production or to a library catalog. Paths are under the repository root.

## 1 Slow checks that end "couldn't check"
- Both times are our own deadlines. server/services/catalog-lookup/platforms.js:32 gives e-Granthalaya 12 requests and 25 s; :57 gives Koha 12 requests and 20 s, raised by bookDeadlineMs (:159-164) to the library's publicCatalogTimeoutMs, capped at 45 s (server/services/libraryBookSearch.js:80). Anna Centenary sets 45000 (server/data/libraries.json:1160). catalog-policies.json is empty.
- Requests are sequential: one per host at a time (server/services/providers/http.js:367), e-Granthalaya also 1 s apart (platforms.js:34).
- e-Granthalaya: an ISBN check is 3 requests on the member form plus 3+ on the cluster form (server/services/providers/egranthalaya.js:609-659, :664-739), a title search 2-3 (:493), each record read 2+ (:525). Every step re-fetches the home page.
- Koha: one title search, up to 3 record reads, then up to 6 ISBNs at 1-2 searches each (server/services/providers/koha.js:569-603, libraryBookSearch.js:99,209-236). A code comment says Anna answers in 4-9 s per request.
- A PROVEN MATCH FOUND EARLY IS THROWN AWAY AT THE DEADLINE (confirmed offline with a fake provider). The search stops early only for an available copy (libraryBookSearch.js:114), waits for the paired title search (:244-248), and the deadline wins the race (server/services/catalog-lookup/check.js:45,62).
- Region not set in the repo: vercel.json has no `regions`, no api/ folder, the whole API is one function (server/vercel.js, 120 s). Runtime logs show sfo1. Vercel supports `regions` per function, but one function means accounts move too unless holdings routes get their own entrypoint. Unconfirmed: whether `regions` works inside `services`.
- HOLDINGS_BACKGROUND_ENABLED (server/catalog-store/config.js:34, used at server/public-v2/holdings.js:194) only switches result marking off. Checks are cancelled at the deadline and when the reader leaves (holdings.js:150-151). A background finish is feasible: server/catalog-store/waitUntil.js exists and the recorder already writes after the response.
- Fix: (a) stop at the first proven match and return the best proven match at the deadline (libraryBookSearch.js, check.js) small; (b) reuse one e-Granthalaya session per check (egranthalaya.js) medium; (c) answer the reader at the deadline, then let the same capped check finish under waitUntil and store it (check.js, catalog-lookup/index.js, holdings.js) medium; (d) then measure bom1 medium.
- Risks: (c) needs the database fix. Keep the 12-request cap. From bom1 the host gate's 300 ms database calls (server/catalog-store/hostGate.js:82) would mostly time out.

## 2 "Couldn't confirm"
- appAnswer (holdings.js:62-67) returns `unconfirmed` when the catalog answered but proved nothing: incomplete search or edition list (server/services/catalog-lookup/outcome.js:107), title-only match (:109), record with no copy shown (:112), or one ISBN not listed for a book asked as a work. "Couldn't check" = no usable answer. Client passes it through client/src/v2/api.ts:171, shows in client/src/v2/ui/book/LibraryAnswerCard.tsx:11,43. Only `unknown` gets Retry (useLibraryAnswer.ts:81).
- Fix: render `unconfirmed` as "Couldn't check" with that icon and no Retry, as `unsupported` already is (LibraryAnswerCard.tsx; drop UnsureGlyph; tests; comment at holdings.js:17-18). Keep the value on the wire. Small. Never map to "not found". No Retry (would repeat the same requests for the same answer).

## 3 Results, book page and catalog link disagree
- Marking reads stored answers first (catalog-lookup/index.js:362-374), then one catalog search with the typed text, marks a book only if a row shows one of its ISBNs (:444-460). Book page searches by title, author and ISBNs. Client answers last one page load (client/src/v2/holdings.ts:28).
- useLibraryAnswer.ts:47-62 always posts holdings/check; the mark only shows early (:75-76).
- The mark line carries no link (holdings.js:240), so the card uses the library's home URL until the check replies (useLibraryAnswer.ts:67,73). Koha search rows carry no record link (koha.js:768).
- After the database fix: same work marked in results; second check becomes a store read. Link still home page until the reply.
- Fix: send catalogUrl in the mark, keep it in the client store, skip holdings/check when the store has found plus a link (holdings.js, holdings.ts, api.ts:182, client/src/v2/ui/search/useLibraryMarks.ts:105, useLibraryAnswer.ts); add the record URL to Koha rows. Medium. A mark belongs to one work ID; never extend to same-title records.

## 4 Shelf and results show one state
- holdings/lookup returns only stored found and definite not_found (holdings.js:108-113); shelfBadge draws only found (client/src/v2/ui/home/shelfItems.ts:74-80). Results stream sends only found (holdings.js:238-243); done.unchecked lumps failed, unmatched, not attempted (:189), client discards it (useLibraryMarks.ts:105-106). "Couldn't check" never stored (server/services/catalog-lookup/record.js:52-53).
- Data needed: not found: already returned for the shelf; results need a notFound list on `done`. Couldn't check: within a visit put `unknown` in the client store (useLibraryAnswer.ts:56) and add couldntCheck list on done; across visits a stored last-failure row per library and book with a short expiry (migration). Not checked yet: everything else.
- Risks: an unmatched result row is "not checked", never "not found". One ISBN not listed is not the work not found (holdings.js:56-60).

## 5 Slow first search
- Client sends no library (client/src/v2/ui/search/useBookSearch.ts:24), so search is Open Library plus Google Books (server/services/workDiscovery.js:81). Three Open Library searches start together (:134-135) but run through one process-wide lane, one at a time and 1 s apart, 12 s deadline each (:25-41). Then up to 2 edition reads (:106-119) and an author or spelling search (:145,157); a misspelling adds two more (:174). Google (8 s) always awaited (:147). Cache 6 h in one instance's memory (:40,71).
- Fix: pace per search, not per read, so the three reads go at once (workDiscovery.js:25-41). Small. Risk: Open Library's rate limit.

## 6 Reload restarts the check
- Answers live only in page memory by design (holdings.ts:1-5); reload posts holdings/check again (useLibraryAnswer.ts:58). Server reads the store first (holdings.js:145-146); production's is empty. After database fix: found and not found answer from the store; couldn't check still reruns in full on every reload. Use 1(c) or the stored failure from point 4.
