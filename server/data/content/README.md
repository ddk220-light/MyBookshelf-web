# Free-content metadata snapshot

`gutenberg.json` contains **1,000 text records**, a bounded subset of the official
Project Gutenberg RDF archive. It is not the complete Gutenberg catalog or a
manually curated collection. It contains metadata and supplied reading/download
links; no book text, PDFs, EPUBs, summaries or cover images are stored.

Source: https://www.gutenberg.org/cache/epub/feeds/rdf-files.tar.bz2.
The RDF `cc:Work` declares CC0 metadata
(https://creativecommons.org/publicdomain/zero/1.0/). Item rights statements are
preserved separately; CC0 metadata does not license the books themselves.

The snapshot records retrieval time, mapping version, deterministic revision and
`complete: false`. The UI/API must display partial catalog coverage. Runtime reads
are bundled/read-only; refresh is an offline build/import action:

```sh
python tools/content/import_gutenberg.py --max-records 1000 --output server/data/content/gutenberg.json
python -m unittest discover -s tools/content -v
```

Offline archive imports additionally require the original `--observed-at` time;
reimporting an old file must not silently renew its access evidence. Invalid,
empty, oversized and unexpectedly shrunken imports preserve the active snapshot.
The importer never extracts archive paths into the filesystem.

Observed in this workspace on Node 22.23.4: 1,973,916 bytes, first search about
29 ms, process RSS about 48 MB. These are local measurements, not deployment SLAs.
The first source must stay behind `CONTENT_DISCOVERY_ENABLED` until refresh,
deployment size and final UI/source checks are complete. Positive access evidence
expires after 24 hours and is downgraded to unknown; an overdue refresh must not
be presented as fresh free-reading evidence.
