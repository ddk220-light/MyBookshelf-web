# Evidence conventions

Paired `NAME.json` and `NAME.html` files preserve exact public request metadata and bounded response bodies. The extension is generic: `ifla-upc.html`, `ifla-unikin.html`, `ced-study.html` and `ucc-size.html` are PDF bytes. The UCC programme capture is explicitly truncated at 2 MB and not used as a verified current size source. Complete readable IFLA extracts are adjacent `.txt` files.

`discovery-s*.json` retains web discovery/indexed source passages, which are never used as actual catalog-query successes. Successes require the independent saved request and body named in findings.json. Titles and holdings were manually inspected.

No cookies, authentication credentials or account state were persisted. Raw public forms include transient CSRF fields; these are evidence of a historical anonymous interaction, not durable replay tokens. A rerun must start a new in-memory session and acquire fresh fields. Query chain metadata in findings.json links every step for the multi-POST searches.

Policy decisions: Mikanda wildcard permits paths with Crawl-delay 10; CEPAS disallows /membre, /auth/ and /livewire/ (none requested) while public GET catalog routes are allowed; UDBL, ULPGL opac, SGN-C and IFRDC robots return404, not a reuse licence. CENCO verification challenge, CEDESURK robots503 and Canisius robots403 stopped queries. Normal HTML fallback responses at UPN and the UDBL institutional website were manually inspected before one library-information-page request. The Theologicum fallback was not separately searched. UNILAC publishes a search-allowed, no-training content signal; only public catalog inspection occurred.

One unsuccessful Mikanda UCC exploratory form/query/result chain omitted the ten-second wait. Later UPC verification explicitly included it. The unsuccessful chain remains preserved and is not counted as a success. Different origins were normally processed with a three-worker bound; this was bounded compatibility research, not a crawl.
