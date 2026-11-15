from pathlib import Path
import json
P=Path(__file__).parent
f=json.loads((P/'findings.json').read_text())
def cell(s):return str(s).replace('|','\\|').replace('\n',' ')
a=['''# Mexico: library integration opportunity screen

Research date: 2026-11-15 UTC. **Seven observed catalog searches: three selected substantial institutions/networks, three ordinary heritage reserves and one restricted reserve. Six observations are policy-eligible; seven selected institutions short of the target of ten.** Fourteen major priorities remain visible; 29 alternatives or excluded candidates have documented blockers. This is a feasibility-selected sample, not a national largest-ten ranking.

The strongest verified single connection is **UNAM's LIBRUNAM / Aleph network**. Guanajuato's central public library and UPAEP provide two Koha reuse candidates. Mexico already has large, mature public and academic library systems; the product opportunity concerns fragmented discovery and unequal reader access. Alma/Primo is strategically important but not cleared for automated searching by this study. ADABI's VuFind catalog supplies useful institution-specific historical records, with incomplete coverage and no live lending evidence.

A final audit identified a research error at UAAAN: its saved robots file contained wildcard `Disallow: /`, which the initial manual inspection missed before queries were sent. That response is preserved as a **restricted reserve**, excluded from eligible successes and selected targets. No further requests were made after detecting the error. See [policy evidence](evidence/uaaan-robots.html) and the `policy_audit` field in [findings.json](findings.json).

## Marketplace, platforms and network leverage

The [DGB public-library directory](https://dgb.cultura.gob.mx/directorio/index.php) lists 7,476 entries, with 6,462 open and 1,014 closed in the indexed snapshot. DGB coordinates state and alcaldía networks, but a directory is not evidence of one national live holdings endpoint. UNAM alone reports 139 libraries and over 7.6 million printed volumes. Reader access remains uneven: [INEGI ENDUTIH 2024](https://www.inegi.org.mx/contenidos/programas/endutih/2024/doc/presentacion_endutih2024.pdf) reports internet use among people aged six and older at 86.9% in urban areas and 68.5% in rural areas. These figures describe access conditions, not LMS adoption or library use. [Retained source extracts](evidence/sources/discovery-market.txt).

Platform evidence supports several families without establishing national market shares:

- **Aleph and Koha:** live LIBRUNAM forms and assets show Aleph; [UNAM's mobile-service portal](https://apps.dgb.unam.mx/) also lists Aleph 500 and Koha 21. Guanajuato and UPAEP returned real Koha book results. [UJED's 2022 announcement](https://www.ujed.mx/noticias/2022/02/ujed-a-la-vanguardia-con-catalogo-institucional-del-sistema-bibliotecario) describes its Janium-to-Koha migration begun in 2021, with UNAM support; that is adoption evidence, not a verified UJED search.
- **Alma/Primo:** [UAM's 2025 institutional report](https://www.iztapalapa.uam.mx/uami/rectoria/informes/informe_actividades_2025.pdf) records its transition from Aleph. [UNAM's 2024 IIB report](https://www.planeacion.unam.mx/Memoria/2024/PDF/6.3-IIB.pdf) describes BNM's Alma/Primo replacement of Aleph, begun at the end of 2023. Colmex's current library portal links to Primo; that destination prohibits this automated research. Old Aleph references must not be assumed current.
- **SIABUC:** [Universidad de Colima's producer page](https://siabuc.ucol.mx/) describes this domestic library system and displays 1,128 institutions using SIABUC9. The counter has no established measurement date or Mexico-only scope; it cannot be used as a national share estimate. [Saved page](evidence/colima-home.html).
- **Prometeo V:** [DGB operating guidelines](https://dgb.cultura.gob.mx/Documentos/Normatividad/lineamientos_de_operacionde_bibliotecas.pdf) provide for an electronic catalog database, and [2026 DGB training](https://moodle.dgb.cultura.gob.mx/course/info.php?id=1039) supports current relevance. Installed counts and a publicly searchable national aggregation were not established.
- **Janium:** official routes for UAEMex, Colmich and the Senate identify Janium deployments. Their policies or access failures prevented eligible queries; route discovery is not a successful catalog test.
- **VuFind:** [ADABI's heritage catalog](https://adabi.org.mx/fuentes/) permits exact collection filters. Three different institutions are proved by both filtered searches and returned `Acervo` fields. ADABI is not counted as an additional institution, and the custodians' underlying LMS cannot be inferred from this aggregation.

For implementation, LIBRUNAM offers the greatest verified network leverage, but needs a new Aleph session/form adapter. Koha compatibility work could serve Guanajuato and UPAEP after fixture checks; UPAEP's broken detail link is a material blocker. The existing VuFind integration is deployment-specific, so ADABI requires custom support. [SERIUNAM and CONRICYT](https://www.juridicas.unam.mx/es/biblioteca/servicios_accesos_base_datos) concern periodicals and licensed scholarly resources respectively; neither is a demonstrated nationwide physical-book availability service. No adapter or live app test was performed.

## Major library priorities

Dates and units differ; this table is not ordered by collection size. Network totals, books, volumes, physical items and institutional proxies are deliberately distinguished. “Indexed official” evidence means an exact official-source extract was retained through discovery rather than a complete local source document.

| Institution or network | Size or institutional proxy, date and source | Research outcome |
|---|---|---|''']
for p in f['major_library_priorities']:
 a.append(f"| {cell(p['name'])} | {cell(p['size_claim'])} [Official source]({p['source_url']}); [saved evidence]({p['evidence_path']}). | {cell(p['outcome'])} |")
a.append('''
## Actual observed book searches

All seven searches below returned HTTP200 public book records; UAAAN is restricted and explicitly excluded from eligible counts. All used GET with no request payload; exact URLs, UTC timestamps, result counts and raw responses are preserved in [findings.json](findings.json) and the linked metadata. A hit count includes editions or related records where specified, rather than a count of distinct works. The three ADABI queries use the literal title fragment `Don Quijote`, `type=AllFields`, and an explicit institution-specific `building` filter; Palafoxiana returned a related work and is labeled accordingly.

| Institution / status | Exact submitted query; returned count | Record and observed holdings | UTC check / evidence |
|---|---|---|---|''')
short={'mexico-unam':'UNAM network — selected','mexico-guanajuato':'Guanajuato central — selected','mexico-uaaan':'UAAAN central — restricted reserve (ineligible)','mexico-upaep':'UPAEP network — selected','mexico-bnah':'BNAH Fondo Conventual — reserve','mexico-palafoxiana':'Palafoxiana — reserve','mexico-durango':'Durango central, historical subset — reserve'}
for l in f['libraries']:
 q=l['query'];b=l['books'][0];title=b['title'] if len(b['title'])<100 else 'Las donquixotadas mas extrañas… (related work; full title below)'
 a.append(f"| {short[l['id']]} | `{q['text']}`; {q['result_count']} result(s) | [{cell(title)}]({b['record_url']}), ID `{b['record_id']}`. {cell(b['holdings'])} | {q['checked_at_utc']} [query]({q['evidence_path']}) / [metadata]({q['metadata_path']}) |")
a.append('''
### Record identity, access and integration observations
''')
for l in f['libraries']:
 b=l['books'][0];q=l['query'];r=l['robots']
 a.append(f"**{l['name']}.** {l['scope']} Returned title: *{b['title']}*. Author: {b['author']}. Record `{b['record_id']}`; ISBN {b['isbn'] or 'not established'}. [Record evidence]({b['evidence_path']}). {q['count_note']}\n")
 a.append(f"{l['reader_access']} Platform: {l['platform']['family']}; {l['platform']['proof']} Robots: HTTP{r['status']}, `{r['decision']}`, checked {r['checked_at_utc']}; [saved policy]({r['evidence_path']}). {r['note']}.\n")
 a.append(' '.join(l['integration']['needs']+l['integration']['blockers'])+'\n')
a.append('''
For UNAM, the saved session/set-number links are transient. Reproduction requires loading the official basic-search form at `https://librunam.dgb.unam.mx:8443/F?func=find-b-0&local_base=MX001`, using its current GET action and submitting `func=find-b`, `local_base=LIBIMP`, `request=Cien años de soledad`, `find_code=WTT`, and `adjacent=Y`. The stable bibliographic identity is base `MX001`, record `002122090`; no guessed permanent URL is substituted. Anonymous form state is retained in response evidence, but no cookies or browser state are saved.

UPAEP's search is a real success, while the detail link returned by that search produced **HTTP410** ([metadata](evidence/upaep-detail.json)). Its availability observation comes only from the search page. ADABI's initial combined search was merely a shell; only the later actual catalog searches and individual book records are counted. Branches within UNAM or UPAEP do not add to institution counts.

## Blocked, unverified and excluded alternatives

These observations mean access was not established, not that the institution lacks the book or a substantial collection. Explicit prohibitions were not treated as generic connectivity errors. The UAAAN exception is an acknowledged research error, excluded from eligible results.

| Institution | Specific blocker | Retained evidence |
|---|---|---|''')
for b in f['blocked_or_unverified']:
 a.append(f"| {cell(b['name'])} | {cell(b['reason'])} | [Source/route]({b['url']}); [evidence]({b['evidence_path']}) |")
a.append('''
## Boundaries and remaining work

The selected target remains seven institutions short after checking major national/public/university collections and meaningful alternatives. Neither the restricted UAAAN observation nor the three historical reserves fill that gap. The historical records prove named collection records but not complete current inventories or lending availability. Large blocked institutions remain priorities, especially BNM, UdeG, Colmex, UAM, Biblioteca de México and Vasconcelos.

Robots404 means no published rule was found, not permission to reuse data. HTTP403, HTTP503, timeout/tunnel failures and a published HTTP route returning400 remain unresolved; no bot challenge was bypassed, no credentials were used and TLS verification was not disabled. A library-directory entry, catalog homepage, indexed title snippet or JS shell was never counted as a successful query. Public search does not establish visitor entry, borrowing eligibility, a reuse licence or continuous circulation accuracy.

Size figures retain their dates and source scope. UPAEP's 163,531 physical items include theses and special collections; Guanajuato's source is from2021; BNAH's approximate300,000 volumes refer to the entire institution, not the tested historical subset. UAAAN's bounded PDF prefix is truncated and is not the evidence for its130,502-volume count; that count is explicitly based on an indexed official report extract. The La Salle portal exposed prefilled third-party login fields in public HTML; those values were redacted locally and never used. Redaction and integrity metadata are retained.

The dossier contains [machine-readable findings](findings.json), [policy decisions](evidence/policy-decisions.json), bounded query/detail/robots responses with request metadata, and [source extracts](evidence/sources/). It changes no application code and asserts no production readiness. Further work should resolve legitimate public access for blocked major catalogs, test Aleph session/link behavior, validate Koha parsing against the retained fixtures, and obtain an officially supported UPAEP detail route before integration.
''')
# Separate the tightly joined numeric phrases from generated prose.
t='\n'.join(a).replace('from2021','from 2021').replace('approximate300,000','approximate 300,000').replace('its130,502','its 130,502').replace('Robots404','Robots 404').replace('HTTP403','HTTP 403').replace('HTTP503','HTTP 503').replace('returning400','returning 400')
(P/'report.md').write_text(t)
print('wrote report',len(t),'characters')
