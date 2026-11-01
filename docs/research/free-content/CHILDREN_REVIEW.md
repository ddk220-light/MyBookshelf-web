# Children's pilot: metadata review gate

Story [#120](https://github.com/ddk220-light/MyBookshelf-web/issues/120), source
review [#121](https://github.com/ddk220-light/MyBookshelf-web/issues/121), UI and
validation [#122](https://github.com/ddk220-light/MyBookshelf-web/issues/122).

The approved pilot needs real English, Hindi and Tamil stories, preserving each
publisher's own reading level and author/illustrator/translator credits. Board
stories are fictional. There are **no published pilot records** in this branch;
`server/data/content/children-pilot.json` is an explicitly empty review manifest.

On 2026-11-01 the official StoryWeaver story page
https://storyweaver.org.in/stories/24620-a-book-for-puchku and its terms page
https://storyweaver.org.in/terms-and-conditions returned HTTP 403 to the direct
workspace requests. A separate web-fetch tool could not retrieve them either.
This is an access limitation of the review environment, not proof the books
require payment or are unavailable to readers. No attempt was made to bypass it.

Publisher search results establish that *A Book for Puchku* exists in those
languages, but a printed-book catalog is insufficient evidence for a specific
freely readable digital translation, translator, level and licence. Other
open reading projects supplied English/Hindi candidates; a Tamil record with
complete source evidence has not been verified. None has been promoted into
the catalog from a search snippet or a guessed translation URL.

## Required for every record

- Stable source-native StoryWeaver ID and exact original reading/metadata URL.
- Title in its original script, one explicit language, original language,
  publisher and source-labelled level. Never infer ages or map publishers' levels.
- Author and illustrator roles, plus translator when the language differs from
  the original. Preserve the publisher's names and role attribution.
- Per-record CC licence URL/statement, separately from public, no-login full
  reading evidence. A platform-wide licence claim does not replace record review.
- Reviewer, observation time and official evidence URLs for credits, language,
  level, rights and anonymous full reading. Offline edits never renew access age.
- No story text, pages, reviews, summaries, images, audio or artwork in the manifest.

At least one fully reviewed record in each of `en`, `hi`, `ta` is required before
the pilot flag can be enabled. The manifest validator rejects incomplete credits,
unknown fields, wrong identities, guessed/off-host links and missing language
coverage. Older access evidence becomes unknown using the same 24-hour rule.

The first curation adapter accepts reviewed StoryWeaver metadata; it makes no
live provider requests. Other publishers require their own verified identity and
metadata contract before adding an adapter. A publisher-approved metadata feed
or a complete reviewed list is the remaining input for publication. The UI and
protocol tests may use clearly labelled synthetic fixtures; those never populate
the production manifest.
