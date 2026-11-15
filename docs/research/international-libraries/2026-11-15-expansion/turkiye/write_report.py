import json,pathlib
D=pathlib.Path(__file__).resolve().parent
f=json.loads((D/'findings.json').read_text())
sel=[x for x in f['libraries'] if x['recommendation']=='verified_target'];res=[x for x in f['libraries'] if x['recommendation']=='reserve']
parts=[f'''# Türkiye (TUR): library integration research

Checked 2026-11-15 UTC. **{len(f['libraries'])} institutions returned actual books: {len(sel)} substantial selected institution and {len(res)} small reserve.** Three title-search submissions were made to three distinct catalog origins; two returned books, while İSAM's query returned HTTP503. No union member or branch is counted separately. Ten substantial successes could not be established; 41 blocked or unverified candidate routes are retained in the evidence, including major institutions. This is a feasibility screen, not a national largest-ten or LMS-share ranking.

The strongest evidenced national leverage is **KYGM's centralized Koha public-library network**, but its catalog explicitly disallows automated access. The [Ministry's 2023 architecture note](https://kygm.ktb.gov.tr/Eklenti/118018%2Ckygm-koha-bilgilendirme-notu---2023pdf.pdf?0=) describes 1,300 public, specialist, children's and other libraries, including Rami, and 21 million registered materials. The note dates Koha use to 2014 and its then-version to 20.11 in January 2023. These are historical network/material totals, not current books or separate integration targets. An authorized network connection could reuse the existing Koha adapter after template and circulation validation.

For academic discovery, [TO-KAT's official statistics](https://veri.ulakbim.gov.tr/hizmet/14) report over 200 collections and 14 million records, with 179 universities in the 2025 table. Its catalog robots returned HTTP403, so no title or member holding was verified. An approved union connection could cover many universities, but union records cannot stand in for real-time copy status, reader eligibility or borrowing. The portal warns that its counts can differ from local institutions. Do not add the union and its members together.

**Yordam is the strongest directly observed new adapter opportunity.** Millet returned Turkish-language HTML book and shelf records. İSAM exposes a Yordam homepage with collection totals, but its title query returned HTTP503. Other major Yordam deployments returned explicit slider challenges and were left untouched. [Yordam's customer references](https://www.yordam.com/tr/referanslar) show university, municipal and specialist customers, but do not establish current national market share. Koha is directly observed at the small Isparta Applied Sciences reserve and independently confirmed by [METU's official catalog configuration](https://lib.metu.edu.tr/en/z3950-configuration). SirsiDynix Enterprise-style, Innovative-style and Primo routes also occur in the sampled candidates; a route pattern alone is not a definitive current LMS audit. No app adapter was edited or tested.

## Ten major library priorities

The order is a research/integration priority list. Units and dates differ; records, mixed resources, print books and institutional proxies must not be compared as a physical-book ranking.

| Priority | Library/network | Source-backed scale or proxy | Observed outcome |
|---|---|---|---|''']
for i,p in enumerate(f['major_library_priorities'],1):parts.append(f"| {i} | {p['name']} | [{p['size_claim']}]({p['source_url']}) | {p['outcome']} |")
parts.append('''
İSAM is an additional substantial specialist candidate: its [public catalog homepage](https://katalog.isam.org.tr/?dil=0) reports 335,545 **book records**, with theses and serials separately listed. This is not a physical-volume inventory. İstanbul Gelişim is a substantial blocked alternative with [192,025 printed books dated 2025-10-01](https://kddb.gelisim.edu.tr/tr/idari-icerik-igu-kutuphane-istatistikleri). [Başkent's official site](https://lib.baskent.edu.tr/tr/hakkimizda/kutuphanemiz-hakkinda) provides a building/service proxy of 12,500 m² and 1,627 seats. Smaller or partial collections were retained rather than used to fill the selected ten.

## Actual specific-book results

All three attempted title queries submitted the Turkish title **Nutuk**; the following two returned actual books. A broad title search can include editions and related works; a response count is not a copy count. Raw HTML and exact request metadata are retained for each result.
''')
for l in f['libraries']:
 q=l['query'];s=l['size'];r=l['robots']
 parts.append(f"### {l['name']} — {'selected' if l['recommendation']=='verified_target' else 'reserve'}\n\n{l['scope']}. Scale: **{s['value']:,} {s['unit']}**, {s['date']}; [source]({s['source_url']}). {s['note']}\n\n- Query: `{q['method']}` [{q['url']}]({q['url']}); payload `{'none' if q['payload'] is None else q['payload']}`. Checked `{q['checked_at_utc']}`; HTTP{q['http_status']}. Effective URL: [{q['effective_url']}]({q['effective_url']}).\n- Response count: {q['result_count']}; classification `{q['match_type']}`. {q['count_note']}\n- Platform: **{l['platform']['family']}**. {l['platform']['proof']}\n- Policy: [{r['url']}]({r['url']}) returned HTTP{r['status']}, `{r['decision']}`. {r['note']}\n- Evidence: [{q['evidence_path']}]({q['evidence_path']}), [{q['metadata_path']}]({q['metadata_path']}).")
 for b in l['books']:
  parts.append(f"\n**Returned book:** {b['title']} — {b['author']}. {b.get('publisher','')}, {b.get('publication_year','')}. Record `{b.get('record_id')}`; ISBN `{b.get('isbn') or 'not verified'}`"+(f"; accession `{b['accession']}`" if 'accession' in b else '')+'. '+(f"[Record]({b['record_url']})." if b.get('record_url') else b.get('record_link_note','No durable record URL was verified.'))+f"\n\n**Observed holdings:** {b['holdings']}")
 parts.append(f"\n**Reader access:** {l['reader_access']}\n\n**Integration needs:** "+'; '.join(l['integration']['needs'])+'.\n')
parts.append('''İSAM's failed exact attempt: GET [https://katalog.isam.org.tr/?dil=0&p=1&q=Nutuk&alan=qEser_txt](https://katalog.isam.org.tr/?dil=0&p=1&q=Nutuk&alan=qEser_txt), no payload, at `2026-11-15T08:21:46.276406+00:00`; HTTP503 upstream connection failure, with no book record. [Request metadata](evidence/isam-nutuk.json), [raw response](evidence/isam-nutuk.html). The query followed its normal homepage by over 353 seconds and was allowed by the saved robots policy. No retry followed.

## Blocked and unverified alternatives

Failures are not evidence that a book is absent. HTTP503 and upstream timeouts may be transient or specific to this execution environment. A failed robots request leaves policy unresolved; no catalog query followed it. Explicit challenges were not bypassed. A library homepage, form, search-index excerpt or branch list does not count as a successful catalog query.

| Candidate route | Retained reason | Evidence |
|---|---|---|''')
for b in f['blocked_or_unverified']:parts.append(f"| {b['name']} | {b['reason']} | [request]({b['evidence_path']}) |")
parts.append('''
## Access, evidence and limitations

Millet and İSAM publish a 300-second crawl delay. Their actual title-query attempts were spaced more than 300 seconds after the preceding request on their respective catalog origins. This delay makes direct interactive requests unsuitable without a permitted cache or an institutional agreement. A procedural lapse is retained: the generic helper initially fetched Millet's homepage immediately after discovering that delay. No title query was made then; the helper was corrected to stop delayed origins, and Millet's actual title query followed its homepage by over 307 seconds. İSAM's robots, homepage and query follow the required spacing.

Public search establishes discovery only. `Rafta` means on shelf, and must coexist with `Ödünç Verilemez` where shown; neither establishes off-site borrowing. General and rare collections have different room/stack arrangements. Institution membership, visitor registration, copy rules and external loan eligibility were not tested. The union/source totals do not establish any of these rights.

Isparta Applied Sciences is a genuine Koha success but remains a reserve because its official indexed source reports only 5,428 print books; the live size-source robots failed. It is distinct from Süleyman Demirel University. Its other VuFind interface is not another institution. Partial faculty and branch routes, including Uludağ theology, do not produce extra institution counts.

The sample is deliberately constrained by policy and availability. It does not establish national platform share or a largest-ten ranking. Size sources have mixed dates and units. TO-KAT record counts are explicitly proxies; Bilkent's book total includes electronic and audio formats; Millet reports mixed printed resources; İSAM reports catalog book records. The ten-success shortfall remains visible instead of substituting small collections or counting unsuccessful routes.

No authentication, outreach, hold placement, app mutation, challenge bypass, TLS bypass or nonpublic endpoint probing was performed. Anonymous requests retain no saved cookies or accounts. Full source claims, exact request metadata, source dates/units, platform evidence and integration limits are in [findings.json](findings.json). Preserved raw bodies are bounded; only the first result page was inspected for each successful title search. Query counts exclude robots, homepage and source-document requests.
''')
(D/'report.md').write_text('\n'.join(parts))
print('report written')
