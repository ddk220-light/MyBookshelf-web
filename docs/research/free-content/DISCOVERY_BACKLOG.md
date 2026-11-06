# Free-knowledge discovery backlog

Updated 2026-11-05. Owner requested a complete backlog and the first ten
high-quality, queryable candidates. **Current scope is research only: do not add
sources to the app.** Work proceeds one group at a time; the first group's
shortlist is a review checkpoint, not approval to implement it or an assertion
that the whole group is complete. The owner subsequently approved continued
research and requested a persistent source registry with ten verified examples
per usable source. Use [ordinary JSON files](registry/README.md) and the
[ongoing goal](registry/goal.json); the earlier stop-after-ten instruction is
superseded for research. See [current counts and gaps](registry/PROGRESS.md).

GitHub backlog: [#164](https://github.com/ddk220-light/MyBookshelf-web/issues/164).
Board: [Free Content Discovery project 4](https://github.com/users/ddk220-light/projects/4).
Planning and evidence: [PR #161](https://github.com/ddk220-light/MyBookshelf-web/pull/161).
Use the [execution workflow](EXECUTION_PLAN.md) and
[master plan](EXPANSION_PLAN.md) for qualification and counting rules.

## Group queue

| Order | Group | Area IDs | Status | Tracking |
| --- | --- | --- | --- | --- |
| 1 | Books, children's reading, textbooks and audiobooks | C01, C02, C04, C05 | First ten persisted; example evidence expanded; deferred/India gaps remain | [#165](https://github.com/ddk220-light/MyBookshelf-web/issues/165) |
| 2 | Learning and technical knowledge | C09, C10, C11, C12, C13 | Started with Wikipedia and Wikibooks; technical/current-curriculum gaps remain | [#166](https://github.com/ddk220-light/MyBookshelf-web/issues/166) |
| 3 | Industry and job knowledge | I01, I02, I03, I04, I05, I06, I07, I08, I09, I10, I11, I12, I13, I14, I15, I16, I17, I18, I19, I20 | Queued | [#167](https://github.com/ddk220-light/MyBookshelf-web/issues/167) |
| 4 | Public information, civic records and maps | C08, C18, C19, P01, P02, P03, P04, P05, P06, P07, P08, P09 | Queued | [#168](https://github.com/ddk220-light/MyBookshelf-web/issues/168) |
| 5 | Scholarly research | C03, C06, C07 | Queued | [#169](https://github.com/ddk220-light/MyBookshelf-web/issues/169) |
| 6 | Language, culture and educational media | C14, C15, C16, C17, C20 | Queued | [#170](https://github.com/ddk220-light/MyBookshelf-web/issues/170) |

These are 49 tracked areas: 20 content categories, 20 overlapping industry tags,
and nine public-information subtracks. They are not 49 independent source-count
quotas. Each public subtrack also has USA and India coverage cells; national,
state and local jurisdictions remain explicit. Language variants, mirrors and
member collections do not inflate origin totals.

## G01 — Books, children's reading, textbooks and audiobooks

[Issue #165](https://github.com/ddk220-light/MyBookshelf-web/issues/165) · [Discovery recipe](discovery/BOOKS_AND_AUDIO.md)

- [ ] **C01** Children's books and early literacy
- [ ] **C02** General books and ebooks
- [ ] **C04** Textbooks and scholarly books/chapters
- [ ] **C05** Audiobooks and recorded books

## G02 — Learning and technical knowledge

[Issue #166](https://github.com/ddk220-light/MyBookshelf-web/issues/166) · [Discovery recipe](discovery/LEARNING_AND_TECHNICAL.md)

- [ ] **C09** School lessons, curricula and examination resources
- [ ] **C10** Courses, lecture notes and teaching materials
- [ ] **C11** Encyclopedias, dictionaries and reference works
- [ ] **C12** Technical documentation and software manuals
- [ ] **C13** Practical, vocational and agricultural guides

## G03 — Industry and job knowledge

[Issue #167](https://github.com/ddk220-light/MyBookshelf-web/issues/167) · [Discovery recipe](discovery/INDUSTRIES.md)

- [ ] **I01** Agriculture and horticulture
- [ ] **I02** Livestock, dairy, fisheries and aquaculture
- [ ] **I03** Forestry and timber
- [ ] **I04** Construction and civil infrastructure
- [ ] **I05** Building operations and facilities
- [ ] **I06** Manufacturing, machining and fabrication
- [ ] **I07** Automotive and vehicle maintenance
- [ ] **I08** Chemicals and pharmaceuticals
- [ ] **I09** Textiles, apparel and leather
- [ ] **I10** Food processing and food safety
- [ ] **I11** Energy, electricity and renewables
- [ ] **I12** Mining and mineral resources
- [ ] **I13** Transport, logistics and warehousing
- [ ] **I14** Maritime, ports and shipping
- [ ] **I15** Aviation and aerospace
- [ ] **I16** Water, sanitation, waste and environmental services
- [ ] **I17** Healthcare and care services
- [ ] **I18** IT, telecom and cybersecurity
- [ ] **I19** Hospitality and tourism
- [ ] **I20** Finance, insurance and accounting

## G04 — Public information, civic records and maps

[Issue #168](https://github.com/ddk220-light/MyBookshelf-web/issues/168) · [Discovery recipe](discovery/PUBLIC_RECORDS_AND_MAPS.md)

- [ ] **C08** Government, policy and development reports
- [ ] **C18** Law, civics and public records
- [ ] **C19** Datasets, statistics, maps and atlases
- [ ] **P01** Government/research reports
- [ ] **P02** Laws, rules and gazettes
- [ ] **P03** Civic decisions, budgets and procurement
- [ ] **P04** Property, ownership records and land rights
- [ ] **P05** Building permits, zoning and planning
- [ ] **P06** Geological, soil and hazard maps
- [ ] **P07** Topographic, land-cover and historical maps
- [ ] **P08** Census, statistics and time series
- [ ] **P09** Environmental and infrastructure data

## G05 — Scholarly research

[Issue #169](https://github.com/ddk220-light/MyBookshelf-web/issues/169) · [Discovery recipe](discovery/SCHOLARLY_RESEARCH.md)

- [ ] **C03** Published research articles
- [ ] **C06** Theses and dissertations
- [ ] **C07** Preprints and working papers

## G06 — Language, culture and educational media

[Issue #170](https://github.com/ddk220-light/MyBookshelf-web/issues/170) · [Discovery recipe](discovery/LANGUAGE_CULTURE_MEDIA.md)

- [ ] **C14** Language learning and adult literacy
- [ ] **C15** Historical documents, manuscripts and archives
- [ ] **C16** Art, museum and cultural-heritage resources
- [ ] **C17** Newspapers, magazines and public-interest articles
- [ ] **C20** Educational podcasts, lectures and documentaries


For G04, maintain a USA/India pair for each P01–P09 row. For G03, first investigate
agriculture, construction, manufacturing and logistics, then the remaining tags.
Content categories are reviewed once in their owning group; industry/public
memberships reference the same source evidence rather than duplicating it.

## Research-pass acceptance

1. Select a bounded, deduplicated candidate batch from that area's discovery
   directories; record international, India and language gaps.
2. Inspect official API/export documentation and metadata/content permissions;
   identify free limits, authentication and an appropriate query mode.
3. Run real machine queries or a permitted import/local-search demonstration.
   Record query terms, native IDs, response evidence and actual destinations.
4. Inspect representative free content, distinguish whole books from chapters,
   previews and loans, and disclose account/territorial restrictions.
5. Deliver a ranked shortlist, deferred alternatives and a specific next step.
   Run full qualification benchmarks only for candidates selected to advance.

An area checkbox closes after its first research pass is reviewed. The eventual
10 → 25 → 50 → 100 progression is recorded separately; neither a ten-source
shortlist nor one checked box means its category has reached the long-term goal.
No paid services, new datastores, source accounts or outreach are authorized.
The later continuation request is tracked in `registry/goal.json`; any actual
research schedule is recorded there rather than implied by this backlog.

## First active batch

[G01 first ten candidates and query evidence](batches/G01_FIRST_TEN.md).
Individual source states remain **probed / recommended for review**. No new source
is qualified for production or enabled by this work. Existing Gutenberg, Open
Textbook Library, Book Dash and StoryWeaver are baselines, not newly found sources.
