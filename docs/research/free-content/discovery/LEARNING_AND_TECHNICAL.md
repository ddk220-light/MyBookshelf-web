# Learning and technical knowledge: discovery playbook

Planning research, 2026-11-05. Covers C09–C13 in the
[expansion plan](../EXPANSION_PLAN.md). Apply its source-count, free-access and
queryability gates using the [review record](../SOURCE_REVIEW_TEMPLATE.md).
The [industry playbook](INDUSTRIES.md) supplies occupation/sector tags; the
categories here describe the learning material. A welding manual can be a C13
guide with manufacturing and construction tags, without becoming three origins.

The linked official pages were reviewed as discovery/documentation evidence.
No API qualification, source signup, production integration or 100-source census
was performed. Directories identify publishers; they do not certify their
catalogs. API documentation does not establish our permission, quota suitability
or actual item access. Bounded permitted metadata imports remain available under
the current no-new-hosted-datastore design.

## C09 — School lessons, curricula and examination resources

**Start with curriculum owners, then follow their resource producers.**
[OER Commons collections](https://help.oercommons.org/support/solutions/articles/42000046866-browse-collections)
provide discovery by subject, educational level, material type and language.
For the US, follow state education departments and their linked district/OER
initiatives to the original publishers. Globally, repeat the process through
national education ministries and teacher-training institutions; a publisher
represented in several hubs remains one origin.

In India, start with [DIKSHA's discovery documentation](https://diksha.gov.in/help/getting-started/explore-diksha/),
which describes anonymous exploration and language/location filtering. Follow
the named content organizations to SCERTs, state boards and teacher-training
institutions. [NCERT's textbook portal](https://ncert.nic.in/textbook.php) is a
lead for official textbook identities, alongside state textbook bodies and
examination-board archives. Treat textbooks shared with C04 as overlapping
category membership, not extra origins. The NCERT page returned 502 in this
review; its current retrieval route remains unverified.

**Search recipe:** choose a board/ministry, grade band, subject and language;
search its official domain for `curriculum`, `teacher guide`, `lesson`, `question
paper`, and the equivalent local-language terms. Example:
`site:{board-domain} "Class 8" "science" "2025"`; then
`"{publisher}" (metadata OR API OR export OR repository)`.
Expand in batches across states, curriculum authorities and independent
nonprofit producers rather than counting grade/subject folders as sources.

**Retrieval and tests:** investigate official catalogs, permitted exports or
attributed aggregator coverage. A DIKSHA browser endpoint is not automatically
a supported third-party API. Require item-level board, grade, medium, subject,
curriculum year and canonical resource identity where supplied. Test one lesson
in native script, a retired syllabus, a paper and its answer key, and a topic
shared across different grades. Reject unrelated or obsolete material masquerading
as the current curriculum. Preserve free enrollment versus paid examination rules.

## C10 — Courses, lecture notes and teaching materials

**Start with teaching institutions, not course-count leaderboards.** The
[Open Education Global member directory](https://www.oeglobal.org/about-us/members-list/)
is a repeatable route to international institutional leads, including community
colleges and regional open-education networks. Investigate each member's own
open course catalog, repository and public lecture-note collections. Membership
alone does not mean that it publishes eligible material. Use institutional
OpenCourseWare catalogs, including [MIT OCW](https://ocw.mit.edu/search/), as
examples of course organization; this review extracted only a shell from MIT's
search page, so it establishes no machine-search route.

For India, [SWAYAM's official overview](https://swayam.gov.in/about) identifies
national coordinators including NPTEL, UGC, CEC, NCERT, NIOS and IGNOU. Follow
coordinator → participating institution → official course/lesson catalog.
Record the producer institution and distribution platform separately. SWAYAM
describes free course learning and paid certification exams; the destination's
actual learning-access conditions still need review.

**Search recipe:** `site:{institution-domain} ("open courseware" OR "lecture
notes" OR "course materials") "{subject}"`, followed by semester/course-code
queries. Sample humanities and social sciences as well as engineering; expand
through country, language and discipline. University departments within one
shared catalog are not independently counted origins by default.

**Retrieval and tests:** seek supported course feeds, reusable metadata exports
or repository harvesting. Preserve institution, course code, semester/version,
lesson order and language. Search must return a course or a named lesson that
can actually be opened; a certificate-registration page is insufficient. Probe
an archived course, a current course, a free-account course, accessible notes and
caption/transcript availability. Check whether enrollment dates affect access.
Never infer that downloading one lecture grants rights to redistribute the course.

## C11 — Encyclopedias, dictionaries and reference works

**Find reference publishers by discipline and language.** Start with scholarly
and national-library reference guides, then follow their primary publishers.
For wiki-based works, [MediaWiki's search documentation](https://www.mediawiki.org/wiki/API:Search)
describes title/content queries and namespace selection. Identify the actual
reference work and operator before selecting an endpoint; wiki software is a
connector family, not an assurance that every deployment permits external use.

In India, [Bharatavani's dictionary collection](https://www.bharatavani.in/home/dictionaries)
is a lead to multilingual dictionaries, glossaries and their publishers. Its
catalog describes both searchable and PDF-based resources. Follow credited
language academies, universities and terminology bodies, and investigate local
reference resources in Hindi, Tamil and additional scripts. Elsewhere, use the
same language-academy/university approach rather than filling the register with
English-language general encyclopedias.

**Search recipe:** `"{discipline}" (encyclopedia OR glossary OR dictionary)
"{language}"` and native terms such as `शब्दकोश` or `அகராதி`; validate official
ownership, then search for API/export/licensing documentation. Expand across
disciplinary reference publishers and separately maintained works. Language
views, namespaces, dictionary editions and mirrors do not create extra origins.

**Retrieval and tests:** distinguish entry-level search from book-title search.
A scanned dictionary searchable only by its title cannot answer a headword
query. Test a homonym, inflected form, native-script spelling, transliteration,
cross-reference and missing term. Preserve headword, sense/entry ID, language,
edition or revision and source authority. Do not label a partial OCR hit as an
exact definition. Public reading and permission to reuse definition text are
separate decisions; show minimal permitted metadata and link to the entry.

## C12 — Technical documentation and software manuals

**Start from official projects and vendors, then locate versioned documentation.**
The [CNCF project directory](https://www.cncf.io/projects/) is one concrete
project-discovery network. Expand through other software foundations, language
communities, public research-software organizations and official hardware/tool
manufacturers. Include India-based public technology projects and institute
software catalogs by searching official organization domains; do not classify
every tool used in India as an India-origin source.

[Read the Docs documents a project/version search API](https://docs.readthedocs.com/platform/stable/server-side-search/api.html).
Its [API v3 documentation](https://docs.readthedocs.com/platform/stable/api/v3.html)
also describes authentication and request limits, including five unauthenticated
requests per minute at review time. This is a promising connector family, with
a capacity and permissions question to resolve before enabling it. An alternative
is an explicitly licensed documentation source/export compiled into a bounded
metadata index. Public repository visibility alone is not a license.

**Search recipe:** directory → official project website → documentation/repository
→ supported search/export/version information. Use `"{project}" "documentation"
"{version}"`, then `site:{docs-domain} "{task or symbol}"`. Expand across
independently maintained project catalogs and subject families. Retain parent
organization identity to avoid counting every repository, release, locale or
hosted mirror as an independent source.

**Retrieval and tests:** identify project, stable version, page/section, language
and canonical link. Test a symbol renamed between releases, a deprecated command,
two projects using the same term, a version-pinned page and a section anchor.
Search snippets must not be mistaken for complete procedural instructions.
Ensure redirects do not silently change a saved version. Exclude paid manuals
and standards that expose only a title or purchase page. This workstream covers
technical documents; occupation/industry applicability belongs in the linked
industry tags.

## C13 — Practical, vocational and agricultural guides

**Use extension and training networks as the expansion engine.** The
[UNEVOC network directory](https://connect.unevoc.unesco.org/home/Explore%2Bthe%2BUNEVOC%2BNetwork)
provides country/region/institution leads for vocational education. Follow each
center to public course-material and practical-guide publishers. For the US,
[NIFA's land-grant institution directory](https://www.nifa.usda.gov/land-grant-colleges-and-universities-partner-website-directory)
provides a systematic route to university extension publication catalogs; county
offices republishing the same university guide do not increase origin counts.

In India, [Bharat Skills](https://bharatskills.gov.in/) describes a central
repository of curricula, course material, videos and question banks. Trace its
trade resources to DGT/NIMI and credited producers. The
[ICAR institution directory](https://www.icar.gov.in/en/institutions) supports
discovery by research division, followed by institutes, agricultural universities
and extension/KVK publication leads. Apply the industry playbook to agriculture,
construction, manufacturing and other sectors instead of inventing separate
categories for every job title.

**Search recipe:** choose occupation → concrete task → skill level → region;
query `site:{institution-domain} (manual OR handbook OR extension OR workbook)
"{task}"`, then publication-series and native-language variants. Expand across
training networks, independent extension publishers, countries and occupations;
do not count every trade PDF as a source.

**Retrieval and tests:** seek publication exports, allowed repository harvests
or attributed metadata feeds. Store occupation/industry tags, task, intended
audience, language, revision and geographic applicability. Test one task with
multiple regional recommendations, two editions of a manual, a multilingual
guide and a training course that requires payment. Verify the exact complete
guide and its publication date. A material's safety or legal currency must not
be inferred from government branding or a recent metadata refresh.

## First research batch and route to 100 in each category

Create ten candidate records for each category, targeting four India origins,
two US origins and four other international origins. Where the pool is sparse,
record the gap and use another documented discovery route. Deep-review two per
category before extrapolating; the ten reviews should exercise distinct retrieval
methods rather than ten copies of one platform.

| Category | First two technical/access reviews |
| --- | --- |
| C09 | One Indian curriculum catalog and one independently maintained teacher-OER catalog |
| C10 | One coordinator-linked Indian course origin and one international university's reusable catalog |
| C11 | One supported entry-search wiki and one Indian dictionary/terminology catalog, explicitly testing search depth |
| C12 | One version-aware documentation API candidate and one licensed documentation-export candidate |
| C13 | One Indian training/extension catalog and one US or other-country practical-publication catalog |

Continue in batches of 25 candidates, adding underrepresented countries,
languages, disciplines and occupations until the 10 → 25 → 50 → 100 qualified
ladder is reached or a documented shortfall emerges. Report pass rate, overlap,
incremental useful coverage and maintainer effort per category. Site search alone
does not advance a source to qualified. No external outreach or source accounts
were created during this planning review.
