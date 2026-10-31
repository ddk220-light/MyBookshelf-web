# IndCat fixture provenance

## Shared holding ownership, 21 October 2026

`allahabad-shared-record.html` is a reduced capture of public record 12539158, ISBN 8173711461, viewed with institution ALHB_211002. It retains the bibliographic table and the institution's accession rows; anonymous CSRF tokens, submit controls and request actions are removed. No ILL form was submitted.

The public member views were compared directly: ALHB_211002 returned accessions 583556 and 583557 with holding name University of Allahabad, Allahabad; IIMI_453556 returned accession 11581 with its own holding name; ABHA_783384 returned no holding rows. All named views referred to the same bibliographic record. The `ucode` field in Allahabad's ILL forms nevertheless repeated the cataloguing agency IIMI_453556. Tests require both the full holding name and an independently confirmed member-search record before using this layout. The JSON comparison evidence is retained in the task's catalog-backlog-validation-2026-10-21 artifact.

`pune-unaccessioned-record.html` retains public record 3267656's bibliography, source institution identifier and record identifier. The live page has an empty holdings table. A separate member-scoped search returns that exact record. This supports catalog presence only; the fixture never establishes an accessioned or available copy.
