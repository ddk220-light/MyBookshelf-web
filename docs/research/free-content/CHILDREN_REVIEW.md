# Children's pilot: reviewed source records

Codex owns source research and curation. The owner does not need to collect a
feed, supply book metadata or verify credits. Story [#120](https://github.com/ddk220-light/MyBookshelf-web/issues/120),
source review [#121](https://github.com/ddk220-light/MyBookshelf-web/issues/121),
review task [#137](https://github.com/ddk220-light/MyBookshelf-web/issues/137),
free-account implementation [#139](https://github.com/ddk220-light/MyBookshelf-web/issues/139).

## Owner clarification and actual access

On 2026-11-01 the owner explicitly accepted free source login and asked that
those books remain searchable and linked. This supersedes the earlier no-login
restriction for verified no-cost accounts. Unknown-price registration, previews,
loans, paid subscriptions and purchases remain excluded.

Direct StoryWeaver requests returned HTTP 403 / browser-integrity error 1010.
A normal Chromium browser with the environment's proxy CA trust loaded the
public book pages, their metadata and the source's open-content policy. No
fingerprint spoofing, CAPTCHA handling, source login or credential replay was used.

The actual Read Story controls for all three reviewed records returned HTTP 401
and a free-account signup offer. They are classified `free_account_required`,
never anonymous full text. Post-login reading was not tested and is explicitly
recorded as unverified. The app sends readers to the original book page to sign
in; it does not manage the source account.

## Reviewed metadata

| Native record | Language / title | Original author / illustrator | Translator | Source publisher / level |
| --- | --- | --- | --- | --- |
| [7](https://storyweaver.org.in/en/stories/7-fat-king-thin-dog) | English / Fat King Thin Dog | Parismita / Parismita | Original | Pratham Books / Level 1 |
| [8](https://storyweaver.org.in/en/stories/8-mota-raja-dubla-kutta) | Hindi / मोटा राजा दुबला कुत्ता | Parismita / Parismita | Manisha Chaudhry | Pratham Books / Level 1 |
| [2252](https://storyweaver.org.in/en/stories/2252-kundu-rajavum-olli-nayum) | Tamil / குண்டு ராஜாவும் ஒல்லி நாயும் | Parismita / Parismita | Manickavasagam Deivanayagam | StoryWeaver Community / Level 1 |

The source identifies 7 as the original for both translations. They retain three
distinct source-native keys; translations link to the reviewed original.
Levels are copied from the individual current source record and are not ages or
cross-publisher equivalences. The production manifest now contains these three
metadata records; source flags still control publication.

The [open-content policy](https://storyweaver.org.in/en/open-content) explicitly
covers all stories and illustrations under CC BY 4.0. Each reviewed item is a
book on that platform with its own metadata/credits and a linked policy; this
is not a claim about its readalong or video, which has different terms. The
terms link's browser shell was reachable, but its substantive terms content was
not independently verified. No comprehensive feed/API integration is claimed.

The old Global Pratham Books mirror was useful for discovery, but its Hindi
link pointed to record 4300, a different translation, and its Tamil translator
credit differed from the current primary record. Those facts were not copied.
No mirror, search snippet or fictional board story was published as source data.
See [metadata-only review evidence](evidence/2026-11-01/children-source-review.json).

## Freshness and repeatable review

`node tools/content/refresh_children.mjs --output /tmp/children-candidate.json`
rechecks only the reviewed set in a normal browser. It verifies unchanged native
IDs, title, language, original-story reference, level, publisher and creator
roles, the current book licence policy, and the individual free-account offer.
Any change or unavailable source stops candidate publication. It never creates
an account, signs in, stores browser state, copies story text/artwork or claims
post-login verification. It accepts at most the bounded 30-record manifest.

The daily draft-PR workflow rechecks this set after the three local catalogs;
failed checks leave the active metadata unchanged. Access observations expire
after 24 hours: old evidence becomes unknown and loses its reading action.
The workflow is scheduled only after default-branch merge. Review new records
and source changes before extending the set; do not manually renew timestamps.
