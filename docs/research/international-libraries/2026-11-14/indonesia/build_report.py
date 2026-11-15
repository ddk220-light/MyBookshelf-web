import pathlib,json
P=pathlib.Path(__file__).parent
d=json.loads((P/'findings.json').read_text())
selected=[x for x in d['libraries'] if x.get('recommendation','verified_target')=='verified_target']
head='''# Indonesia: ten major library candidates, verified with book queries

Ten distinct institutions or library networks returned actual books from specific-title queries on **15 November 2026 UTC**. These are **ten major integration candidates, not a verified national top ten by collection size**. The National Library, UI, UGM and Hasanuddin are important larger prospects that did not pass this run's access/query checks. Replacing them with reachable institutions does not establish a size ranking.

The strongest first public-library pilot is **Jakarta/Jaklitera**: its result for *Laskar pelangi* exposes four available print copies at Cikini and one checked-out copy at Koja. For reusable adapters, start with **INLISLite** at Airlangga/Brawijaya and **SLiMS** at Padjadjaran/Diponegoro. These are not named adapters in the current MyBookshelf provider implementation inspected for this study. All ten searches were research probes; no product integration, authorization clearance, outreach or deployment occurred.

## Marketplace and the largest unlock

Indonesia already has substantial library software and national discovery infrastructure. The opportunity is to connect fragmented local catalogs, explain branch-level availability and user access, and improve the search experience. It should not be described as a country without library infrastructure. The ten successful candidates are all Java-based, so this sample does not establish feasibility for rural or outer-island libraries.

- **SLiMS is the best evidenced broad reusable ecosystem in this investigation.** The project's official registered-user list reports **1,923 Indonesian institutions and 52 Union Catalogue Server users**, last updated **11 February 2020**. These are historical registrations, not a current deployment census or market-share ranking. Live SLiMS union searches succeeded at two large universities. [Official SLiMS list](https://slims.web.id/web/news/daftar-pengguna-slims/)
- **INLISLite is the other priority, especially for public-sector libraries.** It is supported by the National Library and formally designated in 2016. Live examples here include Brawijaya and Airlangga's customized AILiS; West Java's portal also identifies INLISLite 3.1 but its title searches failed. Record IDs, form parameters and holdings presentation vary. No defensible current nationwide SLiMS-versus-INLISLite share estimate was found. [Official INLISLite description](https://www.perpusnas.go.id/p3smpt/inlislite/), [2016 designation](https://jdih.perpusnas.go.id/file_peraturan/SK_19_2016_Penetapan_INLIS_ttd.pdf)
- **Indonesia OneSearch is the largest identified national discovery partnership route:** the National Library reported **4,215 connected institutions** in November 2025. Its partner program explicitly uses OAI-PMH with systems including SLiMS and INLISLite. That potentially unlocks bibliographic metadata across libraries, repositories, archives and museums; it does not mean 4,215 live circulating-library adapters or current copy availability. A harvest is not a circulation API. Direct access to the source article returned 403; the official article and figure were corroborated through the web search index. [National Library announcement](https://www.perpusnas.go.id/berita/dukung-akses-informasi-publik-tanpa-batas-perpusnas-tunjukkan-inovasi-dalam-keterbukaan-dan-layanan-inklusif), [partner/OAI-PMH program](https://www.perpusnas.go.id/berita/koordinasi-dan-advokasi-dengan-mitra-jejaring-mitra-indonesia-one-search-di-sumatera-utara-tahun-anggaran-2023)
- **Large universities are heterogeneous.** ITB WebPAC, ITS SPITS/Linspro, IPB Readily, Telkom Open Library and UIN Sunan Kalijaga's custom SRU interface require additional work. UMS demonstrates Koha exists in the market, but its search served a challenge, so it is not a successful integration candidate from this run. One Koha adapter alone would miss much of the reachable opportunity.

## Ten verified institutions/networks

Collection quantities below retain their source scope and date. Current figures, historical figures and institutional proxies cannot be combined into a league table. One union catalog is one institution/network here; its branches and alternative frontends are not counted again.

| Institution/network | Scale evidence | Query / actual returned book | System | Result |
|---|---|---|---|---|
'''
rows=[]
for x in selected:
 s=x['selection_basis'];scale=s['summary']
 if s['source_url']:scale=f"[{scale}]({s['source_url']})"
 q=x['query'];book=x['results'][0]
 rows.append('| '+ ' | '.join([x['name'],scale,f"[{q['text']}]({q['url']}) → {book['title']} / {book['author']}",x['platform'],'HTTP '+str(q['http_status'])+'; book returned'])+' |')
body='\n'.join(rows)+'\n\n## Reproducible query and integration evidence\n\n'
for i,x in enumerate(selected,1):
 q=x['query'];r=x['results'][0]
 body+=f"### {i}. {x['name']} — {x['city']}\n\n"
 body+=f"- **Request:** {q['method']} [{q['url']}]({q['url']})\n"
 if q['payload']:body+='- **POST form payload:** `'+json.dumps(q['payload'],ensure_ascii=False)+'`\n'
 body+=f"- **Verified:** {q['checked_at_utc']}; HTTP {q['http_status']}. Displayed count: {q['displayed_result_count'] if q['displayed_result_count'] is not None else 'not reliably extracted'}. {q['result_count_note']}.\n"
 body+=f"- **Returned book:** *{r['title']}* — {r['author']}. Record identifier: `{r['record_id']}`."
 if r['record_url']:body+=f" [Returned record]({r['record_url']})."
 body+='\n'
 body+=f"- **Copies/status:** {r['holdings']}\n- **Public eligibility:** {x['public_eligibility']}\n- **Policy check:** {x['policy']['assessment']} No bulk-reuse permission or partner agreement verified.\n- **Integration:** {x['integration_path']}\n"
 body+=f"- **Saved evidence:** [query response]({q['raw_evidence']}), [request metadata]({q['metadata_evidence']})"
 if r['detail_evidence']:body+=f", [detail response]({r['detail_evidence']})"
 if x['policy']['robots_evidence']:body+=f", [robots response]({x['policy']['robots_evidence']})"
 body+='.\n\n'
body+='''For UIN Sunan Kalijaga, the exact-title SRU result has no stable identifier: `recordPosition=1` is only its position in that response. The older HTML query shows shelf location but no deep link. This is a real search success with an unresolved production record-mapping requirement. [HTML shelf proof](evidence/uinsuka-specific.html)

For Padjadjaran, the newer Kandaga public API also returns *Damar Wulan* by Zuber Usman. Its public detail page shows two available copies and ISBN 9786022601319. The API request is the one used by the public search JavaScript, with `status=published` and `access_level=public`; no credentials or private routes were used. This is a second route for the same university, not an eleventh institution. [API response](evidence/unpad-api-specific.html), [detail](evidence/unpad-modern-detail.html)

## Larger or otherwise valuable candidates that failed verification

'''
for x in d['blocked_candidates']:
 body+=f"- **[{x['name']}]({x['url']}):** {x['reason']}"
 if x.get('size'):body+=f" Scale: {x['size']} [Source]({x['size_source']})."
 if x.get('evidence'):body+=f" [Evidence]({x['evidence']})."
 body+='\n'
body+='''
## Implementation consequences

1. Build SLiMS and INLISLite adapters from saved public fixtures, then validate with the app's actual provider interface. Union IDs require the faculty/node component; Indonesian availability strings and copy-level rows need explicit normalization.
2. Pilot Jakarta for a broad public audience; Airlangga/Brawijaya and Padjadjaran/Diponegoro for reuse across software families. Preserve library membership restrictions and onsite-only/withdrawn/warehouse statuses in the UI.
3. Treat OneSearch as an aggregation/partnership opportunity. Clarify metadata rights, endpoint stability, update cadence and institutional coverage, then retain direct institution links or a live holdings layer.
4. Resolve per-host robots, terms, rate limits and data-use arrangements before production. Telkom expressly excludes several named AI crawlers; successful transparent research requests do not settle that policy question. Unusable or missing robots files also do not constitute permission.
5. Obtain comparable current collection statistics from candidates before claiming “largest ten.” Favor verified print-book counts when evaluating a borrowing/discovery product; separate thesis/repository totals, titles, copies and subscription entitlements.

## Verification method and limitations

The research used low-volume public GET and read-only catalog search POST requests with the unchanged transparent user agent `MyBookshelfResearch/1.0 (public catalog feasibility check)`, TLS verification enabled, 25-second timeouts, and a one-megabyte response cap. A homepage, indexed snippet, HTTP 200 challenge page, repository-only search or successful book detail without an actual query was not counted. Search results were paired with returned records and available item metadata. Robots exclusions, explicit challenges and access failures were retained, not bypassed.

The snapshot contains **10 query successes, 0 tested product integrations, 0 permission-cleared production integrations**. Public catalog search does not grant membership, permission to borrow, access to subscription full text, or rights for bulk collection. ITB's sampled copy is weeded, ITS's sampled copies are in storage, Diponegoro has conflicting availability text, and IPB's count/pagination and unloaded holdings need follow-up. Those limits are part of the evidence rather than hidden behind the success count.

The structured [findings.json](findings.json) includes exact methods, URLs, payloads, UTC times, HTTP status, titles/authors, stable identifiers where exposed, size basis, access policy and per-library integration notes. Raw files retain `.html` extensions even when the response is XML or JSON. The directory name reflects the parent study start date; the actual probes occurred on 15 November 2026 UTC. No product code changed, so no application test suite was run.
'''
continuation='''
## Continuation: collection sizes, record mapping and one reserve

The original ten selected institutions are preserved. **Eleven distinct institutions/faculty libraries now have observed book-query successes: ten selected targets and one reserve.** None is a tested product integration, and the national largest-ten requirement remains unproven.

The additional collection research replaces five institution-only proxies with qualified numerical evidence. Brawijaya has a historical 2018 report of 68,152 book titles from a visiting public institution. ITB and Padjadjaran have 2009 government-directory figures, retained with their mixed-format and central-library scopes. Diponegoro's official 2025/26 handbook reports 17,598 book titles / 31,715 copies through 2024 for the Economics and Business faculty alone. UIN Sunan Kalijaga's current official page displays 124,281 “Buku,” but does not identify titles versus copies or a census date. These improve scale evidence; they cannot support an ordered national ranking. Sources are linked in the table above. [Government directory, selected pages](continuation-evidence/government-directory-2009-selected-pages.txt), [original PDF](continuation-evidence/government-directory-2009.pdf), [Diponegoro faculty handbook excerpt](continuation-evidence/undip-feb-2024-size-selected-pages.txt), [UIN official figures](continuation-evidence/uinsuka-facts.html)

One government-directory figure was explicitly rejected: Diponegoro's 2009 entry lists more titles than copies (57,986 versus 25,761). It was not silently corrected or used to rank the library. Brawijaya's 2009 mixed-format total is also not comparable to its 2018 book-title count.

UIN Sunan Kalijaga's stable-record requirement remains unresolved after bounded checks. Its advertised OAI-PMH service ignores a tested date filter; an advertised numeric record link returns only the home/search frame. The RSS title permalink does the same. Its official postgraduate SLiMS alternative returned tunnel403, so no query was attempted there. The original SRU result remains valid search evidence; it does not establish persistent catalog identity. [OAI response](continuation-evidence/uinsuka-entryday.html), [record-link response](continuation-evidence/uinsuka-oai-record60.html), [RSS permalink response](continuation-evidence/uinsuka-rss-permalink.html), [postgraduate-host failure](continuation-evidence/uinsuka-pasca-robots.json)

UGM's current official library homepage advertises a GET search form distinct from the previously failing POST. The new request for *Laskar Pelangi* returned the unchanged latest-books homepage, so it is not counted as a search success. No new National Library physical-catalog route was established, and its restricted OPAC was not retried. [UGM official form](continuation-evidence/ugm-official-home.html), [GET response](continuation-evidence/ugm-official-get-search.html)

### Reserve: Universitas Indonesia — Fasilkom faculty library only

The [official LONTAR faculty catalog](https://lontar.cs.ui.ac.id/Lontar/opac/themes/newui/index.jsp) displays **12,034 book-category records**, observed 15 November 2026. This is narrower than UI's central collection, whose catalog remains unresolved. It is retained as a useful reserve rather than substituted for one of the ten larger candidates.

'''
for x in d['libraries']:
 if x.get('recommendation')!='reserve':continue
 q=x['query']
 continuation+=f"- **Specific query:** GET [{q['text']}]({q['url']}); {q['checked_at_utc']}; HTTP {q['http_status']}. The displayed {q['displayed_result_count']:,} results include broad token matches and mixed documents; the exact requested book is a real search row, not just a recent-books sidebar.\n"
 for r in x['results']:
  continuation+=f"- **Returned record:** [{r['title']}]({r['record_url']}) — {r['author']}; ID `{r['record_id']}`. {r['holdings']}\n"
 continuation+=f"- **Access/policy:** {x['public_eligibility']} {x['policy']['assessment']}\n- **Integration:** {x['integration_path']}\n- **Evidence:** [search response]({q['raw_evidence']}), [request metadata]({q['metadata_evidence']}), [Eisenstein detail](continuation-evidence/ui-computing-detail.html), [Gazdar detail](continuation-evidence/ui-computing-gazdar-detail.html).\n\n"
continuation+='The continuation kept the same transparent research user agent and TLS checks. Catalog bodies remain bounded to one megabyte. The 450KB government PDF is retained; the 26.2MB official Diponegoro handbook was temporarily downloaded with a 30MB cap and only its relevant page text retained. Current app robots semantics were used when assessing exclusions, including wildcard paths and longest-rule precedence. No challenge, explicit exclusion or credential requirement was bypassed.\n'
body=body.replace('The snapshot contains **10 query successes, 0 tested product integrations, 0 permission-cleared production integrations**.', 'The initial snapshot contains **10 selected query successes**; the continuation below adds **one reserve**. Across all eleven there are **0 tested product integrations and 0 permission-cleared production integrations**.')
(P/'report.md').write_text(head+body+continuation)
print('Wrote report.md')
