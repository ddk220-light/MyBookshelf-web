# Free books and research discovery

**Discovery backlog and first batch (2026-11-05):** the
[six-group backlog](DISCOVERY_BACKLOG.md) tracks all 49 content, industry and
public-information areas. [G01's first ten](batches/G01_FIRST_TEN.md) have live
query and representative reading-access evidence for owner review. This phase
is research only; do not integrate or enable these candidates.

**Expansion planning (2026-11-05):** [100-source-per-category roadmap](EXPANSION_PLAN.md)
defines 20 content categories, a group of 20 industry tags, six detailed discovery
playbooks, and dedicated USA/India civic-record, property and geological-map
tracks. It includes queryability gates and staged qualification/enablement.
Use the [source review template](SOURCE_REVIEW_TEMPLATE.md)
for future candidates. It is a planning proposal; named leads are not enabled sources.

The [execution workflow](EXECUTION_PLAN.md) recommends rolling research batches,
one active connector family and frequent verified releases, with timeboxes,
story definitions, operating checks and a bounded first-cycle sequence.

**Current implementation direction (2026-11-03):** use the
[simple free live plan](SIMPLE_LIVE_PLAN.md), authorized by the owner. Live paper
requests and signed provider cursors require no Redis/database. Shared-store
requirements in the older research below are superseded for this release.

Research date: **2026-10-31**. Implementation authorized 2026-11-01; see
[story progress and contract decisions](IMPLEMENTATION.md) and [validation](VALIDATION.md).
The research observations below remain historical evidence, separate from fresh implementation checks.

Canonical repository: **[ddk220-light/MyBookshelf-web](https://github.com/ddk220-light/MyBookshelf-web)**. All future development belongs here.

Build a **metadata discovery service with outbound reading links**. Use a hybrid of locally indexed metadata catalogs and a small number of live search adapters. The app should not download or serve the books or papers themselves.

This is feasible with free sources. The difficult parts are deciding whether a specific edition is actually readable, keeping source permissions and quotas current, and combining overlapping records without losing versions or translations. Free content does not imply an unlimited free search API.

- [Source catalog](source-catalog.md): categories, repositories, connection methods, credentials, constraints, and priorities.
- [Architecture and delivery plan](architecture.md): contracts, query flow, storage, repository integration, and rollout gates.
- [Evidence](evidence.json): historical request URLs, observed outcomes, selected findings, and verification limits.

## Recommendation

Start with **Free books** and **Research papers**. Add **Textbooks & learning** through the Open Textbook Library catalog, then a curated **Children's books** collection. Treat language, subject, reading level, format, and access conditions as separate filters rather than mutually exclusive categories.

| First integrations | Connection | Why |
| --- | --- | --- |
| Project Gutenberg | Official metadata import; local search | Public-domain ebook foundation without scraping or dependence on the public Gutendex demo |
| Open Textbook Library | Official CSV/JSON metadata; local search | Documented CC0 catalog for educational material |
| DOAJ | Live article search | OA journal articles with publisher full-text links |
| Europe PMC | Live search and record details | Biomedical literature with explicit full-text/OA fields |
| arXiv | Atom API behind a shared request queue | Direct preprint coverage with clearly labeled versions |
| OpenAlex | Live search after key/budget verification | Broad multidisciplinary discovery and OA locations; usage is metered |
| DOAB / OAPEN | Metadata imports and OAI-PMH updates | Scholarly books and chapters; next import candidates |

Reuse Google Books and Open Library selectively to enrich book records and resolve existing saved books to candidate free editions. Their general catalogs contain previews, borrowing offers, and metadata-only records; they should not define the free-reading collection by themselves.

## Categories

| Category | Typical material | Representative sources |
| --- | --- | --- |
| General ebooks and public-domain literature | Novels, poetry, essays, historical nonfiction | Gutenberg, Standard Ebooks, Wikisource, Internet Archive |
| Scholarly books and chapters | Research monographs, edited volumes, academic chapters | DOAB, OAPEN |
| Journal articles | Published research and reviews | DOAJ, Europe PMC/PMC, OpenAlex |
| Preprints and working papers | Research before or outside formal journal publication | arXiv, bioRxiv/medRxiv, HAL, Zenodo |
| Theses, dissertations, institutional outputs | Graduate research, technical reports, repository manuscripts | CORE, HAL, Shodhganga, university repositories |
| Textbooks and open educational resources | Textbooks, lessons, course readings, exercises | Open Textbook Library, OpenStax, LibreTexts, OER Commons, NCERT, DIKSHA |
| Children's books and early literacy | Picture books, graded stories, translations, wordless books | StoryWeaver, African Storybook, Book Dash |
| Government, policy, organizational publications | Reports, policy papers, public documents | World Bank Open Knowledge Repository, Library of Congress, institutional repositories |
| Historical and cultural collections | Digitized books, serials, rare texts, regional-language literature | Internet Archive, Library of Congress, Europeana, Biodiversity Heritage Library, Wikisource |
| Audiobooks (optional extension) | Recorded readings of public-domain books | LibriVox |

Journals are **containers**, articles are **items**, and PDF/EPUB/HTML are **formats**. Children's and educational are audience/use classifications that can apply to several item types. An ebook can be a textbook, a children's story, or an academic monograph simultaneously.

## What the original checks established

Structured responses were obtained from Google Books (using the configured key), Open Library, Internet Archive, DOAJ, OpenAlex, Crossref, arXiv, Europe PMC, CORE, Zenodo, HAL, Wikisource, Library of Congress, and LibriVox. Gutenberg RDF and DOAB record/harvesting responses also worked. OAPEN's OAI service identification worked; a record import was not exercised.

These were small one-time checks, not integration, rights, uptime, completeness, or user-country tests. Important counterexamples:

- An Open Library work returned `ebook_access: public` alongside many Internet Archive identifiers. That does not identify which edition is freely readable.
- A HAL hit had a record URL and DOI but no `fileMain_s`: a repository hit is not necessarily full text.
- Zenodo returned a dataset; item-type filtering is essential.
- DOAJ supplied an older HTTP publisher URL; metadata alone does not prove the destination still works.
- Semantic Scholar returned **429**, and Gutendex timed out. Those checks do not establish general service availability.
- Some documentation URLs moved; corrected DOAB/OAPEN URLs appear in the catalog. Some sites returned only a JavaScript shell. NCERT/ERIC/OER Commons could not be fully inspected.

Two current details make older integration advice unreliable: Standard Ebooks' full OPDS feeds require membership/access arrangements, and Unpaywall's documentation said its title-search endpoint retired on **2026-09-18**. Use Unpaywall for DOI resolution and another index for search. Recheck these policies before implementation.

## Credentials and implementation inputs

No additional credentials are needed to review this plan. The original Google Books free-ebook query succeeded using the configured key. For implementation:

1. Verify **`OPENALEX_API_KEY`** in the backend. The replacement environment reports the variable configured; no authenticated OpenAlex request was made during this repository transfer. At the research date the free account included $1/day of API usage, roughly 1,000 ordinary search requests before caching. Disable paid overages unless deliberately budgeted.
2. Choose a real **application contact email** for request identification and, if enabled, Unpaywall's required `email` parameter. No email was invented, registered, or sent during this work.
3. Optional later: Semantic Scholar, BHL and Europeana keys; CORE upgrade/eligibility confirmation. Standard Ebooks feed access and children's/OER catalog feeds need provider-specific arrangements.

Assumptions: global discovery with explicit language/country context; lawful public hosts; verified free source login is allowed (owner clarification 2026-11-01), labelled separately from anonymous reading; no full-text hosting, subscription purchases, or library-card integration. Existing India library coverage makes NCERT, DIKSHA, StoryWeaver and Shodhganga useful follow-ups, but their discovery integrations are not assumed ready.

## Repository transfer and evidence provenance

The original worktree branch was committed as `ee7d88e` in a previous environment but was not pushed. That environment became unavailable. The replacement checkout, archived repository and GitHub did not contain that commit. These documents were **reconstructed from the research and tool results retained in this conversation**, on the canonical web repository's `9f5bb4b` baseline. They are not a byte-for-byte recovery of the original commit.

The original evidence file recorded 85 fetch observations and 23 API probes, 20 of which returned HTTP 200. The replacement [evidence file](evidence.json) preserves the 23 probe URLs/outcomes recoverable from the conversation, documentation references and material findings. Original raw responses, the complete documentation-fetch ledger and response hashes are unavailable; they have not been fabricated or represented as fresh checks. This branch carries only the research and documentation links, not the old repository's history or native applications.

## UI proposal and owner decisions (2026-11-01)

UI boards: [docs/design/2026-11-free-content](../../design/2026-11-free-content/README.md)
(implementation handoff and standalone HTML boards). Owner review copy on a
private Design canvas: https://claude.ai/artifact/NHwYSSaU4VGXDt2Pp9aA4X.
They cover free-book and paper search, details, the library book page link,
source status, partial/unavailable/empty/limit/loading states, the children's
pilot and a desktop layout. Records on the boards are samples.

Owner decisions on the proposal:

1. Keep the four app tabs. Free to read and Papers are scopes inside Search.
2. Free books and papers can be saved to the shelf. Storage for items without
   ISBNs still needs an engineering design before implementation.
3. Results with unclear access are hidden by default and clearly marked when shown.
4. No "include previews and loans" option in the first release.
5. When the broad paper index is at its daily limit, say so plainly
   ("at today's limit") without naming the provider.
6. Children's pilot: English, Hindi and Tamil, using each publisher's own levels.
7. A free book links back to the reader's library by title search, without
   treating the two as the same edition.
8. Rights text stays generic for now: source statement plus "check your
   country's rules", rather than a per-country claim.
9. Use the existing public contact for request identification. Use is
   non-commercial. Traffic expectations and quotas will be set later.

## Current source work (2026-11-01)

The owner clarified that free source login is acceptable and asked Codex to
research additional sources. Three real StoryWeaver records in English, Hindi
and Tamil are now reviewed and searchable with an explicit free-account label;
no source account was created. Book Dash adds 30 real English-language editions
with public anonymous reading links. These are source-native metadata records,
not fictional board samples. The existing OpenAlex key was accepted by its API;
Redis setup is postponed, so live paper enablement remains deferred.
See [children’s review](CHILDREN_REVIEW.md), [additional sources](ADDITIONAL_SOURCES.md)
and [validation](VALIDATION.md). All source flags still default off pending the
intended hosted release checks; local metadata searches need no hosted store.
