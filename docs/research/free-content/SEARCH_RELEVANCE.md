# Free-book relevance and disabled paper search

Owner report and task: [#154](https://github.com/ddk220-light/MyBookshelf-web/issues/154),
2026-11-01. Worktree: `/workspace/MyBookshelf-web-free-sources-implementation`,
branch `research/free-content-discovery-relevance`, based on production main
`1c16815`. The owner clarified that free-book requests succeed but return poorly
ranked results. This is separate from the deferred paper connection.

## Reproduced behavior

The production API returned 20 results for `Mathematics`. Search treated title,
contributors and subjects as one substring field, then sorted all non-exact-title
matches alphabetically. Thus a psychology/statistics title with a broad supplied
Mathematics subject preceded a book with Mathematics in its title. Short terms
could also match inside unrelated words.

| Position | Previous first page | Revised first page |
| --- | --- | --- |
| 1 | A Computational Introduction to Number Theory and Algebra | Contemporary Mathematics |
| 2 | A Contemporary Approach to Research and Statistics in Psychology | Advanced Water Mathematics |
| 3 | A Cool Brisk Walk Through Discrete Mathematics - version 2.2 | Applied Finite Mathematics |
| 4 | A First Course in Linear Algebra | Fundamentals of Mathematics |
| 5 | A First Course in Linear Algebra - 10th Edition-2023-B-D | MGF 1131: Mathematics in Context |

The revised first 20 results all contain Mathematics in their titles. This is a
metadata relevance improvement, not a claim about the best textbook for a
reader's level or a larger catalog. Genuine subject-only matches remain available
after closer matches and show `Subject: …` using the source's own metadata.

## Change

Local search ranks exact titles, complete title phrases/words, contributor
matches and supplied subjects. All query terms must match. Word boundaries
exclude matches such as AI inside chair and art inside cartography or artificial;
prefix matching is available for terms of at least four characters. Latin accent
folding and Indic vowel signs remain intact. Source editions are not merged.

Each result may carry an optional query-scoped `searchMatch` with a field and
source value. Resolve and saved-reference contracts do not change. The local
index revision includes the ranking revision so cursors issued under the previous
ordering restart instead of silently skipping or repeating records.

When the paper sources are disabled, the UI now says **Paper search isn’t enabled
yet**, offers **Search free books instead** with the same query, and does not
offer a retry or depict a network outage. Explicit paper IDs and source-only
requests also report disabled before attempting shared coordination. Genuine
timeouts/outages retain retry and the warning that failure does not prove absence.

## Verification

- Client typecheck and all 176 client tests pass.
- All 571 server tests pass with real disposable Postgres/Redis and zero skips.
- All 56 focused desktop/mobile browser checks pass, including disabled → free
  search, query preservation, subject explanations and accessibility in three lights.
- Feature-enabled build, SEO and deployment checks pass.
- Actual catalog searches verify Mathematics, art, AI and Jane Austen; deterministic
  fixtures cover ranking, author/title combinations, punctuation, word boundaries,
  Indic text, process restarts and stable cursor replay.
- Desktop/mobile screen inspection and hosted release evidence are recorded in
  #154. Synthetic browser fixtures remain distinct from actual source searches.

The four local book sources remain bounded metadata catalogs. Paper enablement
still depends on owner-deferred Redis; #127 separately tracks the GitHub
StoryWeaver refresh prompt failure. No source-observation timestamps are renewed
by this search fix.
