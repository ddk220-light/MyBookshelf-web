from pathlib import Path
import json
D=Path(__file__).parent;f=json.loads((D/'findings.json').read_text())
s='''# Colombia — additional-country library research

**15 November 2026 UTC · 3 observed institutional successes · 0 selected major targets · 3 reserves · shortfall: 10 selected targets.** Twelve major priorities remain visible below. Thirty blocked route entries include two UNAL origins and two UdeA generations; they are not thirty independent institutions. No application integration, login, hold, outreach or deployment was performed.

Colombia is a strong network opportunity but this check does **not** establish ten permitted, working major-library searches. The best longer-term adapter investment is Koha, backed by a historical academic-library study, departmental deployments and documented migration from OLIB. The immediate working sample is three Spanish PMB catalogues. All three remain reserves: Comfamiliar is smaller than the major priorities; María Cano lacks a comparable collection total; Academia Eduardo Santos is a specialized, room-use-only collection. Their existence must not disguise the major-library shortfall.

## Marketplace and platform decision

Public access has several layers: Biblioteca Nacional preserves national heritage; BibloRed, Medellín and Cali provide metropolitan public lending; departmental networks coordinate municipal libraries; Banco de la República operates a national network; university collections have separate eligibility rules. Cajas de compensación, including Comfamiliar, also provide substantial community collections. A shared service, institutional partnership or branch selector does not establish independent holdings.

Restrepo-Arango's **2021 academic-library study** reports Koha at 77 IES, OLIB/OCLC 27, Janium 23, Exlibris 22, Aleph 21, SIABUC 18 and SirsiDynix 11. These are the study's historical categories, not current national market shares; Exlibris and Aleph must not be treated as disjoint vendor categories. Primary institutional/vendor evidence shows change: Universidad de Antioquia migrated from OLIB to Koha in a 2023 report; UNAL announced Alma/Primo implementation on **9 June 2026** and now links Aluna. SENA's older history discusses Aleph/Primo while current indexed catalogue records identify Koha. No Colombian SophiA institutional deployment was established in this bounded investigation. [Study](https://www.academia.edu/50805458/Bibliotecas_acad%C3%A9micas_colombianas), [UdeA migration](https://www.biteca.com/migracion_olib_koha/), [current UNAL portal](https://bibliotecas.unal.edu.co/), [SENA history](https://biblioteca.sena.edu.co/paginas/historia.html).

Koha has the largest evidenced reuse opportunity, but several deployments prohibit search paths or show BunkerWeb challenges. Medellín's official embedded Janium catalogue and UPB's Janium endpoint exclude all paths. BNC has SirsiDynix Symphony evidence and an Enterprise-style public route, also excluded. UNAL and Banco de la República Primo origins expressly prohibit search and `/primaws`; no alternate API request was attempted. BibloRed's current origin could not be checked; its 2025 infrastructure inventory naming both Koha and Pergamum is insufficient to identify the active catalogue. [BNC digital plan](https://www.bibliotecanacional.gov.co/es-co/Footer/Documents/Plan%20Digital/Biblioteca%20Digital%20Nacional.pdf), [Medellín catalogue embedding](https://bibliotecasmedellin.gov.co/catalogo-general/), [BibloRed inventory](https://biblored.gov.co/sites/default/files/documentacion/procesos-contratacion/2025/2025-2/inv-034-2025-invitacion-veeam-backup.pdf).

The high-leverage shared services are Antioquia's departmental Koha collective, BiblioValle/Koha–Llave del Saber, Medellín's Janium service, Banco de la República and OCLC's **Catálogo Colombia Discovery**, launched **11 December 2025**. The last is a group discovery catalogue for physical and electronic collections, not proof of live circulation or ten verified institutional collections. Llave del Saber also supports users/service information; it must not be described as a single, fully verified national book inventory. [Antioquia](https://culturantioquia.gov.co/koha-catalogo-red-de-bibliotecas/), [BiblioValle security plan](https://www.bibliovalle.gov.co/wp-content/uploads/2026/01/Plan-de-Seguridad-y-Privacidad-de-la-Informacion-2025-2027.pdf), [OCLC launch](https://www.oclc.org/es/news/releases/2025/20251211-colombia-discovery-catalog.html).

## Major library priorities

These are priorities, **not a size ranking**. Published counts have different dates and units. No network and its branches are counted twice.

| Institution / independent network | Size or explicit institutional proxy | Live research outcome |
|---|---|---|
'''
for p in f['major_library_priorities']:
 s+=f"| [{p['name']}]({p['source_url']}) | {p['size_claim']} | {p['outcome']} |\n"
s+='''
BibloRed's physical/mixed-resource and digital-resource counts stay separate. BNC's publications and serials are not converted to book titles. UdeA's migration count is **system records**, potentially including nonbibliographic records. Antioquia's bibliographic records are not copies. Campus and library-site counts are scale proxies only.

Reader access matters: BibloRed describes free registration and public lending. SENA's official FAQ allows residents to consult its libraries but requires SENA membership and a current card for taking material home. UNAL/university discovery does not establish general-public borrowing. BNC heritage consultation must not be marketed as ordinary public lending. Academia Eduardo Santos explicitly allows consultation but forbids both external and interlibrary loans. [BibloRed](https://www.biblored.gov.co/noticias/afiliacion-biblored-bibliotecas), [SENA FAQ](https://biblioteca.sena.edu.co/paginas/preguntas.html), [Academia services](https://biblioteca.academiahistoria.org.co/pmb/opac_css/index.php?lvl=infopages&pagesid=2).

## Actual title-query successes — reserves only

All returned HTTP200. Each exact title request, payload, UTC timestamp, selected record, ISBN and raw holdings is retained in [findings.json](findings.json) and the linked request metadata. Search counts count returned bibliographic hits, never physical copies.

| Institution | Submitted text / observed hits | Actual book and holding evidence | Saved query |
|---|---|---|---|
'''
for l in f['libraries']:
 b=l['books'][0];q=l['query'];s+=f"| {l['name']} | `{q['text']}`; {q['result_count']} hits | **{b['title']}**, {b['author']}; record [{b['record_id']}]({b['record_url']}); ISBN {b['isbn']}. {b['holdings']} | [{q['checked_at_utc']}]({q['metadata_path']}) |\n"
s+='''
Comfamiliar's 29 hits include criticism and several editions of the novel. The chosen 2014 record has seven **Disponible** copies and three **En préstamo** copies with past due dates. Past dates do not establish return. A separate record has Pies Descalzos holdings, retained in raw results; it is not another counted library. The >33,800-book size comes from an institutional partner's undated description, not a freshly audited total of the network. The indexed service-guide description calls the library public; the direct PDF URL returned 404, so current general-public loan eligibility remains unresolved. [Partner description](https://indoamerica.edu.co/biblioteca-convenio/).

María Cano's official page lists library hours at Medellín, Cali, Neiva and Popayán and separates the physical catalogue from subscription databases and the repository. The book query verifies Medellín only. The initial unquoted search produced 2,647 broad matches; quoting the full Spanish title produced one exact-title record. A university network proxy is useful, but not sufficient here to establish a national-major collection. [Institutional source](https://www.fumc.edu.co/biblioteca/).

Academia's four hits include **La vorágine** and three related titles. The chosen novel's **Disponible** copy remains for **consulta en sala**; the official service rule overrides any temptation to label it borrowable. The official collection page gives a 1,331-book rare collection and 565 serial publications, which are different subsets and units rather than a total. [Collections](https://academiahistoria.org.co/colecciones/), [saved service rule](evidence/academia-access.html).

## Reproduction and integration notes

Use a fresh anonymous cookie jar in memory. Load the public catalogue page and find the form containing `user_query`. Academia's first form is a predefined digital-document search, so choosing the first form does not execute a title query. Submit the quoted title with `look_TITLE=1` and `look_FIRSTACCESS=1` to the observed action. At Comfamiliar and Academia, submit the returned `search_objects` form to obtain the records; its observed payload includes `mode=title`, the actual returned count and document-type fields. María Cano returns the single quoted-title hit directly.

The working result requests are POSTs. Their URLs alone are **not shareable GET searches**. [Request chains and exact payloads](findings.json) preserve the sequence; fresh-form scripts contain no saved cookies/accounts. Stable selected detail links were separately fetched and returned the corresponding titles and item tables. No reserve button or authentication form was submitted. Earlier failed form-selection/unquoted attempts remain evidence, not extra successes.

PMB requires a deployment-specific parser or adapter extension; an existing pinned PMB implementation is not universal configuration-only support. Preserve Spanish diacritics and edition identifiers, distinguish related titles from the exact requested novel, parse per-copy state, and carry room-use restrictions outside the availability field. Koha, Janium and Primo integration cannot proceed on the excluded paths simply because their underlying software is known.

## Blocked alternatives and limitations

The full per-origin status and reason are in [findings.json](findings.json); [policy-decisions.json](evidence/policy-decisions.json) records longest-match path checks.

- Explicit exclusions: BNC, Medellín, UPB, UdeA Catalejo and Poligran exclude all paths; Rosario and UNAC exclude Koha search; UNAL and Banrep prohibit Primo search/API paths.
- Challenge/access-denied: Antioquia's official shared catalogue returns Cloudflare denial; BiblioValle, Externado, UDES, Caldas, CUN and EIA return BunkerWeb challenges; SENA returns an explicit security-block page with HTTP500. These are not HTML policy fallbacks.
- Unresolved failures: BibloRed tunnel502; USCO, UFPS, Tolima, Manizales, UPN portal, Archivo General and CESMAG robots fail or return503; Pereira robots times out. Tecnológico Comfenalco returns maintenance503. Cali municipal robots returns403, leaving current master-catalogue route unverified.

A failed check never means the library does not hold a book. No forbidden search path was requested, no challenge/TLS/authentication bypass was used, and no repeat retries of a blocked origin were used to seek clearance. Two documented independent official routes were inspected for UNAL; UdeA's vendor-documented new Catalejo route was checked after finding the old OLIB route stale. A robots404 means no published rule, not a licence.

The sample is biased toward technical feasibility. It does not establish the national largest ten, current national LMS market share, live circulation reliability, ISBN-search behavior, general-public eligibility at the university reserves, or permission to redistribute records. No app tests were run because this deliverable changes research documents only. The **ten-selected-target goal remains unmet**; the useful deliverable is three reproducible PMB reserves, twelve large-network priorities, documented policy blockers and a source-backed platform strategy.
'''
(D/'report.md').write_text(s)
