# IndCat fixture provenance

## Search authors, 15 November 2026 UTC

`bhu-title-search.html` is a reduced capture of the institution-scoped search
for `Discovery of India` at Banaras Hindu University (`BHUL_221005`). It retains
the first three real record links and their separate Author paragraphs. Tokens,
download controls, request actions, and unrelated page content were removed.
The search-row metadata does not establish borrowing availability or a holding
without a separately verified institution-owned record.

`bhu-weatherwise-serial.html` retains record `13097433`'s bibliography,
institution/source identifiers and MARC table. Its leader identifies a serial
at bibliographic-level position 7, despite appearing in the Books union
catalog. This is a real catalog holding, but is excluded from the hardening
run's ten-monograph count. Tokens and request actions were removed.

`gndu-prefixed-leader.html` retains Guru Nanak Dev University record `5911381`
(*History and the history teacher*). Its MARC leader begins with a literal
`|a` subfield marker before the leader's normal positions. The reduced capture
keeps the bibliography, leader and ownership identifiers and removes anonymous
tokens and request actions.

## Shared holding ownership, 21 October 2026

`allahabad-shared-record.html` is a reduced capture of public record 12539158, ISBN 8173711461, viewed with institution ALHB_211002. It retains the bibliographic table and the institution's accession rows; anonymous CSRF tokens, submit controls and request actions are removed. No ILL form was submitted.

The public member views were compared directly: ALHB_211002 returned accessions 583556 and 583557 with holding name University of Allahabad, Allahabad; IIMI_453556 returned accession 11581 with its own holding name; ABHA_783384 returned no holding rows. All named views referred to the same bibliographic record. The `ucode` field in Allahabad's ILL forms nevertheless repeated the cataloguing agency IIMI_453556. Tests require both the full holding name and an independently confirmed member-search record before using this layout. The JSON comparison evidence is retained in the task's catalog-backlog-validation-2026-10-21 artifact.

`pune-unaccessioned-record.html` retains public record 3267656's bibliography, source institution identifier and record identifier. The live page has an empty holdings table. A separate member-scoped search returns that exact record. This supports catalog presence only; the fixture never establishes an accessioned or available copy.
