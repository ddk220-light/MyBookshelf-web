# Five metadata search connectors

The owner approved publishing the five completed metadata/outbound connectors on 6 November 2026. This release is based on current main (`ede8360`), separate from the research registry and account work.

| Connector | Search scope | Destination and reading conditions |
| --- | --- | --- |
| Open Book Publishers | Live, publisher-scoped Thoth book metadata | Published publisher/DOI page; book access and reuse terms apply |
| Helsinki University Press | Live, publisher-scoped Thoth book metadata | Published publisher/DOI page; book access and reuse terms apply |
| Project Madurai | Title tokens in 1,149 reviewed work records, including Tamil | Published Unicode text links where supplied; component parts retain their work identity |
| OpenStax | Title tokens in the 16 reviewed Math textbooks | Native book-slug detail pages; other subjects are outside this snapshot |
| Sugamya Pustakalaya | Live anonymous title search, first five displayed entries | Public search results; eligible membership is required to read/download. Anonymous results expose no native book permalink |

Catalog snapshot provenance and hashes are in `server/data/content/metadata-catalogs.json`. This is an explicit reviewed release artifact, not an automatic import of research candidates. Sugamya's composite display keys never claim to be native book IDs. Metadata discovery does not assert free reading; explicit free-full-text searches keep their access gate.

## Verification

- Live local API searches returned relevant items from all five sources; four supported detail resolvers preserved their selected keys. Sugamya opens its public source search. Responses are saved in `evidence/2026-11-06-metadata-release/live-local-api.json`.
- Server: 570 passing tests, 15 environment-dependent skips, zero failures (Node 22, `--experimental-test-isolation=none` makes individual tests execute in this cloud runner).
- Client: 186 passing tests; TypeScript and production build pass. SEO: four passing tests when run from the repository root. An earlier SEO invocation from `server/` failed to locate the built output; correcting the working directory resolved it.
- Browser: 12 Chromium desktop/Pixel journeys across daylight, lamplight and ink; all pass. Six metadata journeys rerun after the font correction. Accessibility checks have no WCAG A/AA violations in the tested search region. Source links, eligibility, detail, save-to-shelf and partial failures are exercised.
- Screenshots in the evidence directory preserve results and details for desktop/phone in all three reading lights. Compared with the approved FreeBookResults and FreeBookDetail boards: existing book covers, typography, row dividers, reading-light colors and navigation are retained. Metadata notices replace unsupported free-reading claims; the source-grouped layout comes from the previously released All knowledge view. The shared sans-serif stack fixes this cloud browser's serif fallback.

## Release and rollback

Deploy only project `mybookshelf` (`prj_AhxvPVIgw95iofXaWigVNSYF30iP`) in team `ddk220`, with the existing content flags. The account-staging project is unrelated. Verify all five on the custom production domain after deployment; record the deployment/commit separately. The previous production deployment is `dpl_4fpEvVXRi2djzqN2NBuqzNPCarGM`, main `ede8360`. A regression can be rolled back to that deployment without altering research evidence.

The 44-item technical recovery goal remains separate. Queryable research connectors are not all production integrations, and these five additions do not claim completion of that larger backlog.

Production verified on 6 November 2026: PR #180, main `d406469d92d34022fbd4a0541350057fc8d8598f`, deployment `dpl_9ACDFzr9QNmqq9yNg4hzzKCcq9EZ`, custom domain https://mybookshelf.cloud. All five anonymous search requests returned relevant items; four native detail lookups preserved identity, and Sugamya uses its public source search. iPhone/WebKit OpenStax search/detail and Sugamya eligibility journeys passed. The source list reports 21 enabled sources. All GitHub release checks passed. Protected preview authentication was unavailable to the cloud client; temporary preview sharing was revoked, and the public production tests used no credentials. Detailed production responses/screenshots are saved on the research branch in `docs/research/free-content/registry/runs/production-metadata-release-20261106/`.
