# Cumulative audit reporting

The owner requested an hourly progress check and cumulative reports after every additional 100 distinct libraries reviewed, continuing from the 554-entry repair cohort through all 6,703 frozen India targets. Count unique library IDs, never retries or reanalysis as additional libraries. No app removal or production activation is authorized.

The archived read-only exporter/monitor are the scripts used in `/workspace/library-audit-review/`. Their original absolute paths are retained as provenance; they are not portable entrypoints yet. They contact no providers and never own the collector locks or change its files. The report-only monitor currently runs separately from the provider worker.

Milestone summaries retain journal-prefix hashes and their observed timestamp/count; counts may be the first safe observation after a threshold. Detailed authoritative evidence remains the Git-tracked original and repair append-only journals and content-addressed bodies. `current/` in the external review directory holds current statuses, named blockers, all tested queries, every returned candidate, current books, historical/reanalysis book observations, link-kind/check states, failures and a per-library JSONL index. These review exports are not the final report.

Finish/validate repairs and reconcile corrected outcomes before opening the full-run gate; after that the same worker queue resumes without another owner approval. Preserve source dates and failed evidence. All item links still need their declared observed state; generic catalog handoffs cannot prove item-link health.

Review CSVs expose connector references and native IDs separately. Deterministic bibliographic fingerprints are labelled; a source that supplies no native ID never gains an invented native identifier.
