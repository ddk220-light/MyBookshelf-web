# Technical connector recovery — 6 November 2026

The owner resumed hourly completion work on the fixed 44 technical/unfinished connectors. Two were already working at the start (Open Book Publishers and Helsinki University Press). This pass adds three: NASA Image and Video Library, Lever Press and CaltechTHESIS. **Five of the original 44 work; 39 remain open.** A documented failure is not completion.

| Connector | What changed | Current query evidence |
| --- | --- | --- |
| NASA Image and Video Library | Use the API explicitly published by NASA (`https://images-api.nasa.gov/search`), whose robots endpoint returns 404, instead of treating the public website’s malformed robots response as an API prohibition | Ten anonymous image-metadata keyword queries, native NASA IDs, empty result and page-two observations. No API key needed; no images/video downloaded. Logos and other rights restrictions still apply. |
| Lever Press | Replace the empty Thoth publisher subset with the publisher’s actual public Fulcrum search form | Ten relevant queries with native monograph IDs; empty search observed. Public terms captured. No books downloaded or private API used. |
| CaltechTHESIS | Use the published Pagefind browser search, which supports query-string restoration | Ten searches with relevant titles and native thesis URLs; first two rendered links only. No campus API or full thesis download. Commercial metadata reuse conditions remain separate from queryability. |
| DOAB | Try the officially documented repository OAI metadata-format endpoint | Repository robots request timed out; target was not requested. A useful recovery/policy trigger is still needed. |
| NCERT | Retry the official online textbook catalog after overnight backoff | Robots still returns 503; target was not requested. |
| Bharat Skills | Current published Craftsmen Training Scheme catalog | Reachable; trade-level book metadata investigation continues. Navigation alone is not working book search. |
| NSDC curricula | Current indexed curriculum/content availability page | HTTP 200 contains navigation only; current app route or documented catalog still needed. |
| Worldreader | Current official BookSmart product page replaces the obsolete mobile catalog | Reachable and links its current reading app; actual item search remains under investigation. |

Primary captures: `registry/runs/technical-recovery-20261106/` and `registry/runs/technical-recovery-india-20261106/`. Query seeds, failures, policy, pagination and rendered metadata: `registry/runs/technical-query-recovery-20261106/`. Verified examples are in the ordinary per-source JSONL files. Historical contracts and findings remain in source records and prior evidence.

Caltech initially hit local Chromium certificate trust and WebKit host-library validation issues. The existing WebKit runtime works with the proxy CA and normal TLS checks; skipping its inaccurate host dependency preflight did not disable certificate verification. The unpublished initial observation schema used BROWSER instead of GET and omitted the required evidence-hash field. That draft is retained separately; corrected records explicitly label hashes as rendered metadata, not raw HTTP responses. Existing committed observation prefixes are preserved.

Research validation: 272 tests pass; registry validation reports 71 queryable connectors and 747 examples. The production release is independently scoped in PR #180 to the five completed metadata connectors from the preceding run. These three new research recoveries are not automatically activated.

Resume from `registry/technical-recovery-goal.json`. The hourly completion task is enabled; the old completed documentation queue and its status reporter remain stopped. This saved goal does not activate the app’s native Goal control.
