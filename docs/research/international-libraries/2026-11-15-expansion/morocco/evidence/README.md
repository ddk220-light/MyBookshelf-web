# Evidence interpretation

Research requests were made on 2026-11-15 UTC with the transparent MyBookshelfResearch user agent, normal TLS verification and bounded responses. Each fetch has a `.json` request/response metadata file and, where a body arrived, a bounded `.html` raw body (extension does not assert content type).

Only `usmba-search-fr`, `cjb-search` and `inau-search` are certified successful book queries. CJB and INAU have one detail follow-up each. `discovery-*.json` files preserve web-search source output for scope, routes and size claims; indexed snippets are not catalogue successes.

CJB required a fresh public form in an in-memory anonymous cookie jar, then a POST with its observed hidden fields. No cookies were written. Ephemeral CSRF values in retained CJB responses and payload metadata were redacted. `original_response_sha256` records the pre-redaction digest; `sha256` and `bytes` describe the retained redacted body. Acquire a fresh form to replay. The findings retain exact semantic fields and a fresh-token placeholder.

Policy decisions for certified queries and explicit restricted candidates are in `policy-review.json`; all robots responses remain available. UM6P robots returned HTTP200 with an explicit security denial and is manually classified as blocked, never an HTML fallback. HTTP404 robots means no published rule, not a reuse licence. HTML bodies for502/503 or tunnel-error metadata are failures, not empty collections.

AUI's linked JavaScript asset was deliberately bounded at1.5MB and marked truncated. It did not produce a public search endpoint or success. The ministry root's meta-refresh to a public Symphony form was followed once; that form timed out. No inferred endpoint, disabled TLS, access-control workaround, patron action or institutional login was used.
