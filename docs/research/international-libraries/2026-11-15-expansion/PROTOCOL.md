# Additional 25 countries: research protocol

This extends the five-country research in `../2026-11-14/`; do not overwrite it. Research only: no product edits, outreach, authentication, holds or deployment. Each country gets its own agent, dossier and exact query evidence. The target is ten substantial, individually identifiable libraries or institutional networks per country, with actual book-search responses.

## Country set

Brazil, Mexico, Colombia, Peru, Argentina; Vietnam, Thailand, Nepal, Sri Lanka, Türkiye; Egypt, Morocco, Algeria, Iraq; Ethiopia, Democratic Republic of the Congo, Kenya, Tanzania, Uganda, Ghana, Cameroon, Côte d'Ivoire, Angola, Mozambique, South Africa.

These are 25 additional countries, excluding India and the five already researched (Bangladesh, Pakistan, Nigeria, Philippines, Indonesia). This is a geographically varied opportunity screen, not a claim that these are the poorest or the only suitable countries. Population, development conditions and catalog feasibility are separate dimensions.

## Required country work

1. Explain the library marketplace and user access: national/public/university networks, the best evidenced common LMS families, and which shared service or adapter would unlock the most. Cite primary or scoped study evidence; a feasibility-selected catalog sample is not national market share. Distinguish journal unions, repositories, ebooks and physical-book holdings.
2. Identify at least ten major library priorities with source-backed size or explicitly stated institutional/network proxies. Keep inaccessible large libraries visible. Different dates/units cannot establish a national size ranking.
3. Verify public catalog searches with actual requests returning books. Aim for ten selected substantial institutions; retain additional smaller or unquantified successes as reserves. Do not pad the selected ten. If ten cannot be verified after researching major institutions and meaningful alternatives, document the shortfall and specific blockers.
4. For every observed success record exact query text, URL/method/payload, UTC timestamp, HTTP status, returned title/author/record ID/link, holdings if exposed, platform evidence, size source, policy/access observations and integration issues. A homepage, search-index snippet, challenge, empty page, zero results or invented URL is not a success. Specific-title searches are preferred; label related-title results explicitly.
5. Preserve bounded raw responses plus request metadata locally. A branch selector is not a separately verified institution. Shared union endpoints may count distinct institutions only when a specific filtered query/returned holding proves that institution's collection. Never count a whole network and its constituent branches again.

## Access and request discipline

- Use transparent public research requests, normal TLS verification and official or directly observed catalog routes. No private IP probes, credentials, internal API access, bot challenge bypass, disabled TLS or prohibited robots paths.
- Check and retain robots before search/detail requests. Respect named applicable AI-agent restrictions as well as wildcard rules. Use longest matching path and Allow only on ties; Python `urllib.robotparser` previously missed a real exclusion and is unsuitable here. Training-only GPTBot rules are not necessarily public-search rules. Record ambiguous policies honestly.
- Robots 404 is no published rule, not permission. A robots URL that returns an ordinary HTTP200 HTML fallback or explicit soft404 may be documented as no interpretable published policy after manual inspection; one bounded public catalog query is acceptable if the official route is open and no explicit exclusion/authentication/challenge exists. Never treat an anti-bot/access-denied page as a fallback. 429/5xx/timeouts are unresolved/transient failures, not policy clearance; stop that candidate's automated query until a legitimate independent route is established. Do not repeatedly retry blocked origins.
- Use small searches, normally one or two title queries and one detail per successful institution. Parallelize different origins (at most 3–4 per agent), not heavy requests to one server. Honor crawl-delay and Retry-After. Do not crawl or harvest collections.
- Public search does not establish visitor entry, borrowing eligibility, reuse licence or live circulation. Reference-only, room-use, damaged and unavailable copies retain their meanings. Failed checks never mean not held.
- Do not save cookies, accounts or browser state. Anonymous form state may be transient; document the fresh-form recipe instead of treating a captured nonce as durable.

## Files and common schema

Each agent owns only `<country-slug>/` here. Write `report.md`, `findings.json`, `evidence/` and optional probe scripts/source files. Source/evidence paths inside findings resolve relative to that country directory. Root owns shared tools, protocol, master inventory, comparison, country context and handoff docs. Do not edit other country files. Do not spawn additional agents without asking root; all slots are scheduled across countries.

Use this structure (additional fields allowed; omit no required core fields):

```json
{
  "country": "Kenya",
  "country_code": "KEN",
  "research_date_utc": "2026-11-15",
  "status": "complete",
  "market": {
    "summary": "...",
    "platform_strategy": "...",
    "adoption_evidence": [{"claim":"...","scope":"...","date":"...","source_url":"..."}],
    "network_opportunities": [{"name":"...","scope":"...","source_url":"...","verification":"...","integration_implication":"..."}]
  },
  "major_library_priorities": [{"name":"...","size_claim":"...","source_url":"...","outcome":"..."}],
  "libraries": [
    {
      "id": "stable-country-local-id",
      "name": "Official library/institution name",
      "recommendation": "verified_target",
      "scope": "One institution / university network / public network, precise scope",
      "size": {"value":null,"unit":"...","date":"...","source_url":"...","evidence_path":null,"quality":"official / indexed official / secondary / institutional proxy","note":"..."},
      "platform": {"family":"Koha","name":"Koha; version if observed","proof":"...","evidence_path":"evidence/...html"},
      "query": {"text":"Exact submitted title text","method":"GET","url":"https://...","payload":null,"checked_at_utc":"...","http_status":200,"effective_url":"...","result_count":null,"count_note":"...","match_type":"exact_title / related_titles / subject","evidence_path":"evidence/...html","metadata_path":"evidence/...json"},
      "books": [{"title":"Actual returned title","author":"...","record_id":null,"record_url":null,"isbn":null,"holdings":"Observed copy/location/status; unknown if absent","evidence_path":"evidence/...html"}],
      "robots": {"url":"https://.../robots.txt","status":404,"checked_at_utc":"...","evidence_path":"evidence/...json","decision":"no_published_rules / allowed_path / restricted / unresolved","note":"..."},
      "reader_access": "...",
      "integration": {"existing_adapter":"candidate reuse / new family / custom","needs":["..."],"blockers":["..."],"live_app_tested":false}
    }
  ],
  "blocked_or_unverified": [{"name":"...","url":"...","reason":"...","evidence_path":null}],
  "limitations": ["No national largest-ten ranking established", "..."],
  "sources": [{"url":"...","claim":"...","evidence_path":null}]
}
```

Only real observed successes go in `libraries`. Use `recommendation: reserve` where scale or scope does not justify selected status. At most ten selected; any number of useful reserves. If zero pass, use an empty array with a substantive market study, ten priorities and documented failed checks. Do not invent titles or positive statuses to fill a template. Use `null`, not zero, for unknown counts. POST detail links must retain method/payload and not masquerade as GET links.

## Available tools and implementation context

- Web discovery: discover `mcp__codex_apps__search_service_web_run`; up to four queries per call. Results can be large: retain exact useful sources without printing entire metadata catalogs.
- Shell: `tools.exec_command`; cwd `/workspace/MyBookshelf-web`. Use `PYTHONPATH=/workspace/mybookshelf-cloud/python-libs` for BeautifulSoup. Node22: `/workspace/mybookshelf-cloud/node-v22.23.4-linux-x64/bin/node`.
- Shared `probe.py` saves bounded anonymous responses and readable metadata; its `robots_decision` implements longest-match rules. Inspect returned books manually; a parser string match alone cannot certify success.
- For normal public forms requiring an anonymous session, an in-memory `urllib.request.build_opener(urllib.request.HTTPCookieProcessor())` may be passed as `opener=` to `fetch`. Do not persist cookies. Capture fresh form fields, then submit the public form as an ordinary visitor would; record this recipe and semantic query parameters.
- Existing app Koha adapter is a reuse candidate; richer title parser has some template limitations. Room-use Notes may be ignored (MMSU previous research). VuFind/PMB implementations are pinned to known deployments, not universal configuration-only connectors. SLiMS, INLIS, NewGenLib, TLC/LS2, LibMax and many custom systems need new adapters. Read previous adapter report if relevant; no need to replay every country before research delivery.
- Final report should lead with observed/selected/reserve counts, market recommendation, a table of ten priorities and actual successful queries, then blocked alternatives and limitations. Report evidence honestly even if the requested ten cannot be reached.
