O*NET 31.0 occupation data
=========================

This research-only copy contains the official occupation-code, title and description JSON file. It is not imported by the app. Source: https://www.onetcenter.org/dl_files/database/db_31_0_json/occupation_data.json

This file includes information from the O*NET 31.0 Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). Used under the [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/). O*NET® is a trademark of USDOL/ETA. The JSON bytes are unmodified; query samples and local ranking are our processing and are not endorsed or tested by USDOL/ETA. Capture date and SHA-256 are in examples/onet.access.jsonl. Other O*NET site/tool licenses are outside this file’s scope.

Python documentation inventories
================================

The `python-docs-*.inv` files are unmodified official Sphinx metadata exports for
Python 3.14 and 3.15, retained for research reproducibility. They contain symbol
names and documentation destinations, not whole manuals. Capture requests,
robots evidence and byte hashes are in `examples/python-docs.access.jsonl`.
The PSF License v2 text, copyright notice and description of our derived
analysis are retained in `analysis/legal-notices/python-psf-v2.json`.
The minor-version URLs may change; the byte hash identifies each saved build.

O*NET archive cross-checks
=========================

The additional 31.0 JSON capture has the same SHA-256 as the earlier current export. The `onet-30.3-occupation-*.xlsx` file is the provider-linked 30.3 occupation spreadsheet, licensed under the same CC BY 4.0 attribution terms (substitute version 30.3). It contains only occupation codes, titles and descriptions, not whole manuals or personal records. All 1,016 rows match the current occupation table.

The `onet-30.3-occupation-*.json` filename records the **requested** release, not a verified internal version: its dictionary link unexpectedly says 30.4. It is retained as negative evidence and was rejected by the 30.3 parser. Do not relabel it or import it as verified 30.3 data. Exact request URLs, robots evidence and byte hashes are in `examples/onet.access.jsonl`; comparison results are in `examples/onet.qualification-benchmark.jsonl`.
