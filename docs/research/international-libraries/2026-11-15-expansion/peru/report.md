# Peru — expansion research, 15 November 2026

**5 institutions returned actual books: 4 selected university systems and 1 specialist reserve. The selected-ten goal is short by 6.** The major institutional sweep is documented below, including policy restrictions, challenges and failed routes. No app changes or integrations were made.

Use the existing Koha adapter as a candidate for UNCP, UNSCH and UNSA, subject to template and access-policy review. UNSM needs a Quibuk adapter. The SNB public union has the strongest potential municipal reach, but its API returned an explicit access denial. The four-university Consorcio is another promising route whose currently discovered Enterprise/Primo search origins disallow automated access.

## Marketplace and access

Peru has a national heritage/reading-room institution, municipal libraries coordinated through the SNB, large university systems and specialized research libraries. BNP reports 7.5 million mixed bibliographic/documentary materials, not lending books. Its Colección Peruana is reading-room consultation with registration/DNI. The municipal initiative reported40 new libraries in15 regions in2025; that is infrastructure, not evidence of40 searchable holdings in the new union. [BNP size](https://www.bnp.gob.pe/bnp-recupera-43-000-materiales-bibliograficos-afectados-por-plagas/) · [Municipal expansion](https://www.gob.pe/institucion/bnp/noticias/1202839-la-biblioteca-nacional-del-peru-cumple-meta-historica-implemento-40-nuevas-bibliotecas-publicas-municipales-en-15-regiones-del-pais) · [BNP room use](https://www.bnp.gob.pe/servicios/sala-de-lectura/sala-coleccion-peruana/).

Koha is the best evidenced reusable family in this sample: actual results at UNCP, UNSCH, UNSA and MALI, plus restrictive/failed installations at UNI, USMP, UNSAAC and others. The2021 SNB project explicitly included Koha support. PUCP uses a SirsiDynix Enterprise public form; historical UNMSM evidence identifies Symphony. BCRP procurement and the2025 ExLibris Peru event support Alma/Primo adoption. UNA Puno exposes PMB; BNP exposes AbsysNet; official UNALM evidence names Sophia; UNSM exposes Quibuk. These are deployment observations, **not market-share estimates**. UPeU illustrates why current evidence matters: its historical page says Symphony but current robots identifies Koha. [SNB project](https://elperuano.pe/noticia/120823-biblioteca-nacional-anuncia-proyecto-de-catalogo-unificado-del-sistema-nacional-de-bibliotecas) · [BCRP](https://www.bcrp.gob.pe/docs/Transparencia/pac/2024/resolucion-0021-2024-gca000-n.pdf) · [ExLibris meeting](https://hubinformacion.continental.edu.pe/blog/hub-de-informacion-lidera-el-encuentro-nacional-de-exlibris-peru-2025/) · [UNALM](https://www.lamolina.edu.pe/vice_acad/BAN.htm).

The Consorcio shared-search announcement covers PUCP, Pacífico, Lima and UPCH. No returned ownership from those institutions was obtained, so it yields zero verified targets here. University repositories, ALICIA results and subscribed ebook platforms are separate from physical holdings. [Consorcio announcement](https://biblioteca.pucp.edu.pe/noticias/busqueda-compartida-catalogo-de-las-bibliotecas-del-consorcio-de-universidades).

## Major size-informed priorities

These12 priorities preserve large blocked institutions. Mixed materials, combined print/electronic totals, dates and institutional proxies cannot establish a national size ranking.

|Institution|Size or explicit proxy|Observed outcome|
|---|---|---|
|[Biblioteca Nacional del Perú / Gran Biblioteca Pública de Lima](https://www.bnp.gob.pe/bnp-recupera-43-000-materiales-bibliograficos-afectados-por-plagas/)|7.5 million bibliographic/documentary materials; 2025, mixed material types|AbsysNet form opened; POST query returned WRONG IP; not successful.|
|[UNMSM — Biblioteca Central Pedro Zulen / SISBIB](https://andina.pe/agencia/noticia-san-marcos-los-servicios-ofrece-universidad-al-publico-general-y-no-conocias-939499.aspx)|Over 214,000 titles and390,000 volumes in state-news report; historical/date uncertain|Official-site robots 503; independently linked catalog robots timed out.|
|[PUCP Sistema de Bibliotecas](https://www.pucp.edu.pe/la-universidad/nuestra-universidad/pucp-cifras/datos-academicos/?seccion=sistema-de-bibliotecas)|491,942 printed+electronic books,December 2024, limited stated system scope|Enterprise catalog robots disallows all.|
|[UNI Sistema de Bibliotecas](https://faua.uni.edu.pe/biblioteca/)|University-wide engineering library system; institutional proxy, no total|Koha search/detail disallowed.|
|[UNALM Biblioteca Agrícola Nacional](https://www.lamolina.edu.pe/vice_acad/BAN.htm)|National agricultural information center; institutional proxy|Official-site robots 503; independently cited BAN origin timed out.|
|[UNSAAC Sistema de Bibliotecas](https://transparencia.unsaac.edu.pe/links/disposiciones/documentos/resRectorales/r328-2021ManualCatalagaciobiblioteca.pdf)|30 active libraries in2021 manual; network units, not book count|Koha central search/details disallowed.|
|[Universidad Nacional del Altiplano — Puno](https://biblioteca.unap.edu.pe/opac_css/index.php)|Over 120,000 titles claimed on homepage; mixed material scope/undated|PMB results paths explicitly disallowed, including OAI-SearchBot.|
|[UNSA Sistema de Bibliotecas](http://bibliotecavirtual.unsa.edu.pe:8009/)|Multiple central/faculty/regional libraries; institutional proxy|Verified selected; exact physical-book result.|
|[UNCP Biblioteca Central / CRAI](https://intranet.uncp.edu.pe/sites/uncp.edu/files/institucional/oficina/secretaria-general/resolucion/cu/2016/0682-cu-2016.pdf)|Central+specialized system in2016 regulation; institutional proxy|Verified selected; reference-location restriction must be retained.|
|[UNSCH Biblioteca Efraín Morote Best system](https://biblioteca.unsch.edu.pe/)|3 thematic central-library levels and specialized units; proxy|Verified selected; no reliable numerical size.|
|[UNSM Sistema de Bibliotecas](https://transparencia.unsm.edu.pe/documentos/2024/transparencyportal/transparencyportalregulations/17f0a397-246c-4488-935c-8f28b18fc0eb.pdf)|University central+specialized system in official ROF; proxy|Verified selected; Quibuk title and physical copy observed.|
|[Instituto de Estudios Peruanos — María Rostworowski](https://iep.org.pe/biblioteca/)|35,000-plus books/periodicals; source alternates titles/volumes|Koha explicitly excludes ChatGPT-User; no catalog query.|

## Successful book requests

Exact requests, UTC timestamps, HTTP statuses and saved responses are in [findings.json](findings.json). All five below returned HTTP 200 and physical-copy evidence. Each university system counts once.

|Selection|Institution / family|Submitted text|Returned book and identity|Holdings|
|---|---|---|---|---|
|verified_target|Universidad Nacional del Centro del Perú — Biblioteca Central / CRAI / Koha|Cien anos de soledad|[CIEN AÑOS DE SOLEDAD](https://koha.uncp.edu.pe/cgi-bin/koha/opac-detail.pl?biblionumber=54734); GARCÍA MÁRQUEZ, GABRIEL; ID 54734|One Libros copy, Biblioteca Central, 869.634/C49/1982, Disponible; record description says Tercer piso - Referencias. Preserve reference-location meaning; not proof of home loan.|
|verified_target|Universidad Nacional de San Cristóbal de Huamanga — Biblioteca Efraín Morote Best system / Koha|Cien anos de soledad|[Cien años de soledad / Gabriel García Márquez](https://opac.unsch.edu.pe/cgi-bin/koha/opac-detail.pl?biblionumber=98957); García Márquez, Gabriel, 1928-; ID 98957|One Libros copy, Biblioteca Central, Colección General, Sala de Ciencias Aplicadas y Humanidades (2do. PISO), 869.6344/ C4o/ 1985, Ej.1, Available; barcode BC/G00024145.|
|verified_target|Universidad Nacional de San Agustín de Arequipa — Sistema de Bibliotecas / Koha|Cien anos de soledad|[Cien años de soledad](http://bibliotecavirtual.unsa.edu.pe:8009/cgi-bin/koha/opac-detail.pl?biblionumber=841783); García M., Gabriel; ID 841783|One Libros copy at Bibl. Central de Sociales, J01-33-024, copy1, Disponible, barcode BCS/M32210-1. Norma2004,410 pages.|
|verified_target|Universidad Nacional de San Martín — Sistema de Bibliotecas / Quibuk|Cien años de soledad|[Cien años de soledad](https://sisbiblioteca.unsm.edu.pe/catalogo/detalle/208270); García Márquez, Gabriel; ID 208270|One Libros copy: item 60331, Biblioteca Especializada de Idiomas, 869.634/G23, barcode 64-1-00489, Disponible. 1989 edition.|
|reserve|Museo de Arte de Lima — Biblioteca Manuel Solari Swayne / Koha|Jose Gil de Castro|[José Gil de Castro: Pintor de libertadores](https://biblioteca.mali.pe/cgi-bin/koha/opac-detail.pl?biblionumber=15348); Majluf, Natalia [ed.]; Cruz, Pablo; Amigo, Roberto; Wuffarden, Luis Eduardo [et al]; ID 15348|Two Libro copies, Manuel Solari Swayne, 759.8505 G45J, both Disponible; barcodes005657 and013464.2014,508 pages.|

MALI is retained as a smaller specialist reserve: its2020 source reports 15,400-plus volumes, 413 special materials and1,000-plus periodical titles separately. Its query is a shortened title/person phrase with related results; the observed 2014 book is explicitly identified. It does not replace a substantial university target merely to reach ten.

UNSM requires two ordinary anonymous public requests: the title form navigates to `/catalogo?search[0].filter=1&search[0].text=Cien años de soledad`; the client then requests the same URL with `handler=biblios&page=1`. It returned record 208270. The visible item-table handler `/catalogo?handler=items&id=208270` returned one copy at Biblioteca Especializada de Idiomas, status Disponible. This is a specific returned holding, not a facet-only inference. See [client evidence](evidence/unsm-results-js.html), [bibliographic response](evidence/unsm-query-data.html), [item response](evidence/unsm-items.html).

UNCP needs special care: its available copy is described as Tercer piso - Referencias. The2016 official regulation reserves reference materials for use inside the library and restricts external readers to authorized on-site use. Do not translate Disponible into unconditional home lending. UNSCH distinguishes student and teacher loan limits; visitor access remains unconfirmed. UNSA uses its officially cited HTTP port 8009 endpoint, requiring a transport review before integration.

## Blocked and unverified alternatives

Robots were saved before catalog requests and checked with longest-match rules, including ChatGPT-User and OAI-SearchBot. HTTP 404 means no published robots rule, not a reuse licence. HTML bot challenges were stopped. No robots denial, challenge, TLS verification or identity check was bypassed.

- **BNP AbsysNet** — HTTP 200 empty body comment WRONG IP after normal anonymous form POST; not a book response. Session embeds server token; fresh form necessary and stable egress may be necessary. No retry/bypass. [Evidence](evidence/bnp-query.json).
- **SNB public union API** — Public Angular client points to apicatalogo.snb.gob.pe; robots 403 Acceso no permitido. No API query. App-shell HTML robots manually inspected but did not override API refusal. [Evidence](evidence/snb-api-robots.json).
- **UNMSM website** — robots 503; unresolved. [Evidence](evidence/unmsm-robots.json).
- **UNMSM linked catalog** — robots timeout; unresolved. [Evidence](evidence/unmsm-cat-robots.json).
- **PUCP Enterprise** — Disallow:/; stopped. [Evidence](evidence/pucp-cat-robots.json).
- **UNI Koha** — Search and details disallowed. [Evidence](evidence/uni-robots.json).
- **USMP SIBUS** — Wildcard Disallow:/; Google exceptions do not apply. [Evidence](evidence/usmp-robots.json).
- **UNSAAC Central** — Search and detail queries disallowed. [Evidence](evidence/unsaac-robots.json).
- **UNALM information site** — robots 503; unresolved. [Evidence](evidence/unalm-robots.json).
- **UNALM BAN** — robots timeout; unresolved. [Evidence](evidence/ban-robots.json).
- **UNA Puno PMB** — Search result paths excluded for wildcard and OAI-SearchBot; homepage not success. [Evidence](evidence/unap-robots.json).
- **IEP Koha** — ChatGPT-User Disallow:/ plus wildcard search exclusion; no query. [Evidence](evidence/iep-cat-robots.json).
- **UPeU** — Koha search excluded. Historical Symphony adoption does not establish current software; live robots explicitly labels Koha. [Evidence](evidence/upeu-robots.json).
- **UTP** — robots 404 but book query 418 attack-block page; stop, not absent. [Evidence](evidence/utp-query.json).
- **UNHEVAL** — Two bounded exact-title requests returned0 results, including title shown in popular homepage; route/matching incomplete, not institution absence. [Evidence](evidence/unheval-query2.json).
- **UNFV** — robots 500 block page; stop. [Evidence](evidence/unfv-robots.json).
- **UNAC** — robots read timeout. [Evidence](evidence/unac-robots.json).
- **UNT Trujillo** — robots returned BunkerWeb bot challenge; stop. [Evidence](evidence/unitru-cat-robots.json).
- **UPCH Primo** — /primaws and /discovery/search excluded. [Evidence](evidence/upch-cat-robots.json).
- **Universidad del Pacífico** — Disallow:/. [Evidence](evidence/up-robots.json).
- **Universidad de Lima** — Disallow:/. [Evidence](evidence/ulima-robots.json).
- **UNE** — robots 503 connection timeout. [Evidence](evidence/une-cat-robots.json).
- **Ministerio de Cultura network** — robots 503. [Evidence](evidence/cultura-robots.json).
- **SUNAT** — robots is proof-of-work challenge. [Evidence](evidence/sunat-robots.json).
- **Norbert Wiener** — robots is proof-of-work challenge. [Evidence](evidence/uwiener-robots.json).
- **UMA** — robots timeout. [Evidence](evidence/uma-robots.json).
- **UCSM** — robots 503 timeout. [Evidence](evidence/ucsm-robots.json).
- **UNAS** — robots 503. [Evidence](evidence/unas-robots.json).
- **IMARPE** — robots tunnel502. [Evidence](evidence/imarpe-robots.json).
- **SENCICO** — search/detail paths disallowed. [Evidence](evidence/sencico-robots.json).
- **Casa de la Literatura** — robots 403 WAF block. [Evidence](evidence/casa-robots.json).
- **Barranco municipal** — robots 503 timeout. [Evidence](evidence/barranco-robots.json).
- **UPECEN** — robots 503. [Evidence](evidence/upecen-robots.json).
- **MINAM BIAM** — robots 403 Incapsula. [Evidence](evidence/biam-robots.json).
- **Tribunal Constitucional** — robots timeout. [Evidence](evidence/tc-robots.json).

BNP reproduction recipe: enter the official catalog, follow its meta-refresh to a fresh anonymous server session, extract the public search form and POST its hidden fields plus `xsqf01`. The saved attempt used `Cien anos de soledad` and received only a WRONG IP comment; it is not successful despite HTTP 200. Captured session URLs are evidence, not durable integration endpoints. No cookies or browser state were saved.

## Limits and delivery

This is a feasibility-selected screen, not a national census or finished integration. Four selected systems use sourced institutional scale proxies. No inaccessible institution was labeled as not holding the requested book. Bounded raw responses and request metadata are under [evidence](evidence/); [source notes](evidence/source-notes.json) distinguish downloaded sources from indexed primary evidence. Success counts exclude homepages, repository/ebook hits, zero-result searches, branch selectors and unresolved query shells. No live-app adapter test was performed.
