# Full-collection search release — 6 November 2026

The owner approved production integration, then restricted **new releases to
full-collection searches**. Research “Working” counts include small catalogs and
exact-ID experiments, so they are not production activation counts.

This release adds 18 integrations to All knowledge: CORE, Met Museum, Free Kids
Books, Google Books, Appropedia, Crossref, OSTI, Cleveland Museum of Art, NASA Image
and Video Library, Federal Register, Internet Archive, FAO publications, Lever
Press, Nal’ibali, LA Referencia, O*NET occupation profiles, National Gallery of Art
and Art Institute of Chicago.

Fifteen use live collection-wide provider queries. Title search is explicit where
that is the supported mode. Internet Archive searches unrestricted text items;
media and lending-only records are outside this book connector. Three search
**complete published metadata exports**, not the research example lists:

| Catalog | Records | Search |
|---|---:|---|
| O*NET 31.0 | 1,016 | Occupation titles |
| National Gallery of Art | 146,454 | Artwork titles and artist names |
| Art Institute of Chicago | 139,752 | Artwork titles and artist names |

Snapshots are versioned, dated and labelled. Their exact source URLs, full input
hashes, record counts and compressed/projected hashes are in
`server/data/content/complete-catalogs.json`. Every native record is retained;
untitled works cannot match a title query. `prepare-complete-catalog.py` reproduces
the snapshots from the exact reviewed exports. No image, book or audio bodies are
imported. Export metadata licences are CC0 or O*NET's CC BY 4.0; image/content
rights remain separate. There is no new datastore or scheduled task.

## User behavior and limits

Results preserve native provider identities and lead to the original source.
They do not assert free full text. The explicit free-full-text filter still excludes
metadata-only records. Museum media, datasets and other records have a type filter.
NGA exports do not supply the current canonical website slug: their links use the
published museum keyword form, explicitly labelled as source **search results**.
A guessed bare-ID NGA route failed with 404 and was rejected. Art Institute web
pages returned 403 to the cloud client; its separately published complete metadata
export is permitted. Source reading/access conditions can differ from metadata
query availability.

Provider paging is signed and bound to the search. HTML pages with more than six
matches retain unshown matches on subsequent requests. Each provider failure is
independent; 429s retain their backoff. The existing three-request browser queue,
30-second transport deadlines, response limits and source URL controls remain.
In-process pacing is a courtesy, not a distributed quota. CORE's anonymous
100-token/day allowance can result in a labelled throttle. No paid key is added.
Google Books uses the already configured server-only credential; an anonymous
429 is preserved in the evidence.

## Not newly activated

CMDA's third-party planning subset, FDIC games and IMO's six resolutions fail the
owner's full-collection requirement. DOAB/OAPEN via OpenAlex, latest-release feeds,
fixed class/topic/trade subsets, exact-record-only endpoints and browser-only
research experiments are not silently promoted to app connectors. Tatoeba's
English-only runtime trial is also excluded. Storyberries' current robots policy
excludes the checked agents. DOAJ live tests passed, but its existing shared-rate
restriction remains; arXiv also remains deferred. Existing enabled production
sources retain their previous scope; this release does not relabel their limited
snapshots as complete. Research task scheduling remains paused.

The research inventory at commit `9a68f98` has 102 Working records; that means a
supported query within each recorded research scope, not 102 release-ready
full-collection app integrations. Remaining research entries still need applicable
runtime support or full-collection proof. They are not counted as deployed.

## Verification

Evidence is under `evidence/2026-11-06-full-collection-release/`: policy checks,
actual live requests and result identities, second-page/empty controls, complete
export hashes and failed attempts. Appropedia's initial failure was caused by the
local command lacking network permission; the permitted run succeeded. Its
published robots redirect returns 404, interpreted as unavailable policy per
RFC 9309, not a disallow. Nal’ibali pagination headings and explicit empty states
were repaired after real negative tests. DOAJ/Tatoeba trial evidence is retained
even though those integrations are excluded.

Local checks: 591 server tests pass, 15 database-dependent tests skip; 186 client
tests pass; client type checking, production build and SEO pass. Twenty-seven
browser scenarios cover existing/new source behavior on desktop Chromium, mobile
Chromium and WebKit, in daylight/lamplight/ink, with accessibility and overflow
checks. A test initially matched the navigation tab “Free to read”; it was corrected
to inspect result cards. Hosted deployment identity and anonymous production
verification will be appended after release.
