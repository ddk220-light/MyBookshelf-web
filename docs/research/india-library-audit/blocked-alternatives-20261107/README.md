# Alternatives for the original 114 blocked library entries

Prepared on 7 November 2026 while the main repair collector continues. No active audit files, code, locks or production settings were changed.

The 114 entries use 17 catalog hosts. Rayat (43), MES/Pillai (29) and Somaiya (28) cover 100 entries; the remaining 14 use individual hosts.

## Prepared discovery fallback

- 113 entries have a constructed, member-scoped search-link template.
- B. N. College Bhagalpur has a catalog landing-page link while its form and challenge classification remain under review.
- Four sample terms per search template give 452 offline URL/encoding/scope checks. No provider requests were made by this preparation.
- These are links for a user to open. They are not fetched result lists, live availability findings, working query connectors, or twenty-book passes. URL construction alone does not prove that a live website currently works.

See [all 114 entries](blocked-alternatives.csv), [structured records and example links](blocked-alternatives.json), and [documentation leads](documentation-leads.json).

## Machine-search research

Rayat publishes its union-catalog entry point and the available user search fields on an [official member-college page](https://www.csc.ac.in/facilities/library/union-catalogue). Somaiya also publishes a [union-catalog entry point](https://sksasc.somaiya.edu.in/en/library/). These support user-facing handoffs; they do not establish a public machine API.

[Koha's official web-services manual](https://koha-community.org/manual/21.05/en/html/webservices.html) documents SRU, configurable OAI-PMH and public reports. Each requires a provider-published/enabled interface. OAI metadata may omit item holdings and is harvested data rather than a live native website search. The [public REST documentation](https://api.koha-community.org/) includes known-record/item lookups; that alone does not establish public keyword search.

No alternative API has been verified for these 114 entries in this pass. Changing output format on the same restricted route is not an independent alternative. Institutional digital repositories or older portals are retained as leads with their different scope, not substituted for current print holdings.

## Next safe checkpoint

When the current collector releases its locks, archive this research into the Git-tracked audit collection, correct B. N. College's uncertain block classification, and investigate the three large shared catalogs first. Test only documented permitted interfaces through the shared coordinator. Preserve native IDs, exact query semantics, library/branch ownership, book type, paging and negative findings. Keep link-only discovery separate from verified returned book results. No new accounts, outreach, paid services or deployment are included.
