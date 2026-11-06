#!/usr/bin/env python3
"""Generate the owner's plain group/connector query status; no network or activation."""
import csv
from datetime import datetime, timezone
import json
from pathlib import Path

REGISTRY = Path(__file__).resolve().parents[2] / 'docs/research/free-content/registry'
GROUPS = {
    'G01': 'Books, children’s books and audiobooks',
    'G02': 'Learning and technical documentation',
    'G03': 'Industry and job knowledge',
    'G04': 'Government, maps and public data',
    'G05': 'Research papers and scholarly sources',
    'G06': 'Language, culture and media',
}
MODES = {
    'usgs-topo-metadata': 'Local title/state/native product-auth-ID search over65240 current US Topo map metadata records; version UUIDs preserved, no map downloads, historical maps or other National Map layers',
    'nhm-nuhm-catalog': 'Local title-token/native file-URL search over11 published NHSRC NUHM guideline links; central NHM catalog, site-wide search, document content and clinical currency not verified',
    'chicago-zoning': 'Live Chicago SODA zoning-class equality queries; first2 native GLOBALID/OBJECTID features, five metadata fields; no geometry/address/personal-owner data',
    'shodhganga-indcat': 'IndCat public keyword form with explicit Shodhganga checkbox; first20 records filtered to literal title tokens and native Shodhganga handles; no repository requests or full-catalog/reader guarantee',
    'worldreader-public-browser': 'Anonymous BookSmart browser title search, US/English default library, first20 results with native UUID/version; reading, other countries/languages, paging and standalone API not verified',
    'snapplify-shop': 'Anonymous public shop title searches, first page filtered to available zero-price items; Book Dash examples; checkout, reading, other territories and full catalog not verified',
    'bookshelf-epmc': 'Europe PMC-indexed Bookshelf book/chapter metadata with native NBK IDs, open-access flag and title queries; direct NCBI queries/readers remain unverified/restricted',
    'certin-booklets': 'Local title-token/language-label search over44 public cyber-safety booklet links covering12 topic groups; no PDF/full-text/advisory searches or reader verification',
    'nai-reference-table': 'Local title-token/native RT-ID search over78 published NAI reference tools and finding aids;9 ambiguous rows excluded, full Abhilekh archival-file catalog and reader access still blocked',
    'indcat-sru': 'Live quoted CQL title search, first2 provider records filtered to all literal title tokens; native bibliographic IDs, no catalog-wide absence or free-reading guarantee',
    'diksha-featured': 'Local topic/link-language search over10 reviewed public quiz links for5 featured topics; main Library/course search remains login-gated,4 ambiguous links excluded, no content access tested',
    'nsdc-reports-ui': 'Live public title-word form over sector-wise industry-skills reports, first10 rows and native report-file URLs; original occupational standards/model curricula remain unverified, no PDF downloads',
    'scielo-articlemeta': 'Live exact SciELO article-PID lookup within Brazil collection scl through documented ArticleMeta REST, body=false; no upstream keyword or whole-network search guarantee',
    'bnf-gallica-metadata': 'Live exact literal-title queries over data.bnf.fr editions linked to native Gallica ARKs, first3 results; no direct SRU, whole-Gallica, broad keyword or full-text guarantee',
    'epathshala-selector': 'Local title/native-code and class-filter queries over421 unambiguous published textbook-selector records; commented entries and unresolved mappings excluded, no reader/book downloads',
    'seattle-catalog': 'Live Seattle catalog q keyword search with local title-substring filtering of first3 upstream items; native catalog IDs only, no underlying asset/owner records, paging or empty control yet',
    'gutendex-native': 'Exact native Gutenberg ebook-ID metadata lookup; one current success but subsequent native-ID timeout leaves recovery open; title search remains unreliable',
    'nqr-public-browser': 'Public browser qualification-title keyword form, first20 native qualification links; ten passing queries after paced recovery of a prior page403; intermittent availability remains, no files or enrollment tested',
    'dgma-circular-catalog': 'Local title or native versioned-URL search over18 dated circular links on current DGMA home page; no full archive, document bodies or legal-currency guarantee',
    'gsa-frpp-catalog': 'Local title/year or exact resource-URL search over13 annual FRPP summary dataset labels; no asset/owner rows or spreadsheet content',
    'rosap-oai': 'Live anonymous native ROSA P record-ID metadata lookup through documented OAI; date-filtered page verified separately, upstream keyword search/full text unverified',
    'bhuvan-product-catalog': 'Local title/version and native product-selector search over85 published Bhuvan Store products; no tiles, imagery, owner records or whole-portal coverage',
    'nyc-zoning-index': 'Live anonymous SODA2.1 exact zoning-map label search in dataset wwcv-s7e7; native row IDs and map-index labels only, no property-owner data or authoritative zoning determination',
    'free-kids-wp-metadata': 'Live known-book title queries via advertised public WordPress metadata, first3 records; blog posts coexist, no arbitrary-topic/whole-catalog book-only relevance guarantee',
    'artic-export': 'Local title/artist tokens and native ID search over the complete pinned published artwork metadata export; no images or other API record types',
    'nist-crossref': 'Live title-ranked search of Crossref metadata restricted to NIST DOI prefix10.6028; first3 records, no direct NIST website/full-text access or all-NIST-output guarantee',
    'bharat-electrician-catalog': 'Local title/native resource-URL search over 57 Electrician ebook metadata entries; language/year/syllabus preserved, other trades and book bodies unverified',
    'caltech-public-browser': 'Anonymous public browser keyword search, first two rendered title/native thesis links; no campus API, pagination/full-text or blanket reuse permission',
    'nasa-images-public': 'Live anonymous NASA image-metadata keyword search, first 2 native NASA IDs; page 2 and empty results verified, no media download or reuse approval',
    'lever-fulcrum': 'Live Lever Press public publisher keyword form, first 15 native Fulcrum monograph IDs; no ebook downloads or private API',
    'madurai-catalog': 'Local title/native PM work-number search in the published Tamil works catalog; component titles grouped, listed format links not fetched',
    'thoth-metadata': 'Live publisher-scoped monograph/edited-book title search via public Thoth API; native work UUID and publisher/DOI outbound links, no reading-access gate',
    'sugamya-public': 'Live anonymous book-title search, first 5 displayed entries; native book IDs/item links are hidden, so local composite keys and outbound search links only; eligible-member login for downloads',
    'openstax-catalog': 'Local title/native book-slug search over 16 rendered public Math textbooks; other subjects/languages and full reading unverified',
    'storyweaver-ui': 'Live published English story search, first30 native story IDs/title links; full reading and translation/version relations not tested',
    'african-storybook-ui': 'Live all-language approved-storybook browser search; first40 visible metadata cards, native loadBook IDs and selected English-title examples; language filter/reader not verified',
    'nalibali-public': 'Published live keyword form; current /stories/ posts retained from first10 site results, native post IDs and landing URLs; translations/full reading not tested',
    'storyberries-public': 'Published live keyword form, first9 story/article post results with native IDs and title links; no full-story copy or blanket reuse license',
    'archive-texts': 'Live title search restricted to text items reporting a CC public-domain mark/zero license; first2 native Archive IDs, uploader rights claims and reader access unverified',
    'bookdash-public': 'Live published keyword form returning native book/variant pages; literal-title examples verified, language counts are not translated edition IDs',
    'gutenberg-csv': 'Local title-token/native ebook-ID search over the complete permitted weekly CSV; PG release date is not print edition date, no book downloads',
    'standard-new-releases': 'Local title-token/native edition-URL search over the free latest15-release Atom feed only; full-catalog OPDS requires membership and is not tested',
    'google-books-metadata': 'Live bibliographic title search, first3 native volume IDs and actual access flags; free-ebook/full-view filters returned zero here, so free-copy discovery is unverified',
    'govinfo-ui': 'Live public browser title-field search, first10 package/granule results; API-host failure is separate, no document/full-text download',
    'gutendex-books': 'Live title/author word search, first32 Project Gutenberg ebook IDs reported public domain in USA; shared Gutenberg origin, no reading/territory guarantee',
    'openlibrary-search': 'Live title search restricted to public-ebook works, first3 work IDs with matching edition IDs; no full-item reading guarantee',
    'google-books-public': 'Live title search restricted to free Google ebooks, first3 native volume IDs with country/viewability metadata; full reading not tested',
    'core-public': 'Live anonymous CORE work-title search, first1 native work with underlying output/provider IDs; no full text or reader guarantee',
    'doaj-public': 'Live public article title-field search, first3 native article IDs; page2/empty tested, no full-text or broad-topic ranking guarantee',
    'who-publications-ui': 'Browser-only live WHO publication keyword filter, first50 native item URLs; selected website catalog, not full IRIS holdings',
    'rit-thesis-catalog': 'Local title-token search over the complete captured published thesis listing; native thesis IDs/year groups, no PDF or live upstream keyword search',
    'lareferencia-title': 'Live public Title-field search across the LA Referencia aggregate, first10 native network records; provider links retained, full-item access not verified',
    'msha-public-ui': 'Published Public Research guest browser keyword search; native product IDs from visible metadata links, not display rank; document/media downloads blocked',
    'marad-reports': 'Local title-token search over11 published trade/report entries; report years preserved, no vessel-owner lists or underlying statistical-row queries',
    'fostac-manuals': 'Local title-token search over13 linked advanced food-safety manuals; no PPT/full-text/training enrollment or download validation',
    'libretexts-ui': 'Browser-only live Commons Books keyword search, first24 native library/page IDs; Load more tested, full-text and edition identity not inferred',
    'nptel-catalog': 'Local title-token search over3482 unambiguous course IDs from the published catalog; semester/version and lecture text not searched',
    'booksprints-catalog': 'Local title-token search over139 published sample catalog entries; entries may be projects/series, full-book access not assumed',
    'fao-opensearch': 'Live title-filtered Atom publication search; first 3 results with native handles, no broad-topic relevance guarantee',
    'pmc-oai': 'Exact PMC native-record metadata lookup through OAI; date/set harvesting also tested, no upstream keyword search',
    'preprint-details': 'Live bioRxiv/medRxiv DOI and version lookups; date-paged metadata verified separately, no upstream title search',
    'crossref-public': 'Live title-ranked bibliographic search, first 3 records with native DOIs; no free-full-text guarantee',
    'nga-csv': 'Local title-token search over 146454 art-object metadata records from the pinned CC0 export; no image search',
    'arxiv-atom': 'Versioned Atom metadata API; current export-host robots restriction prevents live query verification',
    'fda-guidance-ui': 'Browser-only public guidance keyword table; first10 visible results with draft/final and native links',
    'epa-nepis-ui': 'Browser-only public EPA NEPIS keyword form; first15 results with native document keys',
    'osha-publications': 'Live public publication title/keyword/number search; exact returned language/version links',
    'faa-handbooks': 'Local title-token or exact native URL search over42 reference-handbook catalog links; no full-text search',
    'siyavula-toc': 'Local chapter-title tokens or exact chapter URL; no body-topic/translated search',
    'sphinx-inventory': 'Exact documented symbol lookup in a downloaded metadata inventory',
    'world-bank-indicators': 'Exact country, indicator and year; no natural-language search',
    'eurostat': 'Exact dataset/dimension lookup; current sample is EU population density',
    'wa-owned-land': 'Bounded Washington state-owned parcel identifiers/county filters; no owner data',
    'blm-plss': 'Survey grid identifiers; no ownership data',
    'plss-townships': 'Survey grid identifiers; no ownership data',
    'boston-zoning': 'Zoning district/layer queries',
    'landportal-metadata': 'Dataset metadata labels/identifiers; no individual ownership records',
}


def classify(source, audit_row, registry=REGISTRY):
    if audit_row.get('passing_examples', 0) >= 10:
        return 'working'
    from small_catalog_coverage import verified_single_work
    if verified_single_work(source, audit_row, registry):
        return 'working'
    return 'blocked_or_failed' if source['state'] == 'deferred' else 'still_checking'


def generate(registry=REGISTRY):
    audit = json.loads((registry / 'completion-audit.json').read_text())
    sources = [json.loads(p.read_text()) for p in sorted((registry / 'sources').glob('*.json'))]
    if set(audit['source_gaps']) != {s['id'] for s in sources}:
        raise ValueError('Audit/source inventory differs; run capture/index/audit before reporting')
    excluded = [s for s in sources if s.get('research_selection', {}).get('included') is False]
    sources = [s for s in sources if s.get('research_selection', {}).get('included') is not False]
    groups = {key: {'id': key, 'name': name, 'total': 0, 'working': 0,
                    'blocked_or_failed': 0, 'still_checking': 0} for key, name in GROUPS.items()}
    rows = []
    for s in sources:
        a = audit['source_gaps'][s['id']]
        status = classify(s, a, registry)
        q = s['query']
        mode = MODES.get(q['adapter'])
        if not mode:
            intents = list(dict.fromkeys(c.get('intent', '') for c in q.get('cases', []) if c.get('intent')))
            mode = ' / '.join(intents[:2]) if intents else 'Supported current search method not yet verified'
        recovery = s.get('recovery', {})
        decision = s.get('dossier', {}).get('decision_and_followup', {}).get('facts', {})
        operating = s.get('dossier', {}).get('operating_limits', {}).get('facts', {})
        reason = (recovery.get('reason') or decision.get('blocker') or operating.get('current_restriction')
                  or ' | '.join(s.get('limitations', [])[:2])) if status == 'blocked_or_failed' else ''
        rows.append({'group_id': s['group'], 'group': GROUPS[s['group']], 'connector_id': s['id'],
                     'connector': s['name'], 'status': status, 'passing_examples': a['passing_examples'],
                     'tested_search_scope': mode,
                     'known_limitations': ' | '.join(str(v) for v in s.get('limitations', [])),
                     'next_step_or_blocker': s['next_action'],
                     'block_reason': reason,
                     'last_attempt_and_result': ' / '.join(str(recovery[k]) for k in ('attempt', 'result') if recovery.get(k)),
                     'recovery_decision': recovery.get('decision', ''),
                     'last_reviewed_at': s.get('last_reviewed_at'),
                     'record': 'sources/' + s['id'] + '.json', 'production_activation_changed': False})
        groups[s['group']]['total'] += 1
        groups[s['group']][status] += 1
    rows.sort(key=lambda row: (row['group_id'], row['status'], row['connector'].casefold()))
    totals = {key: sum(g[key] for g in groups.values()) for key in ('total', 'working', 'blocked_or_failed', 'still_checking')}
    totals['not_working_verified'] = totals['blocked_or_failed'] + totals['still_checking']
    totals['assessed_or_deferred'] = totals['working'] + totals['blocked_or_failed']
    totals['remaining_to_assess'] = totals['still_checking']
    totals['passing_query_examples'] = sum(row['passing_examples'] for row in rows)
    result = {'generated_at': datetime.now(timezone.utc).isoformat(), 'scope': 'Currently recorded research connectors; discovery can add more. Not deployed-app inventory.',
              'meaning_of_working': 'Can query offered items within the stated tested scope, backed by current passing examples. Normally ten examples; an explicitly reviewed one-work publisher subset can use two real searches plus a complete listing and empty control, without padding. Exact lookups are distinguished from title/topic search.',
              'meaning_of_blocked_or_failed': 'Deferred with a recorded reason; not necessarily permanently unavailable.',
              'coverage_definition': 'Queryability by group and connector, per owner clarification. Deeper research-quality checks remain separate.',
              'inventory_total': len(sources) + len(excluded),
              'excluded_connectors': [{'connector_id': s['id'], 'connector': s['name'], 'group_id': s['group'],
                                       'reason': s['research_selection'].get('reason'),
                                       'record': 'sources/' + s['id'] + '.json'} for s in excluded],
              'totals': totals, 'groups': list(groups.values()), 'connectors': rows}
    (registry / 'connector-status.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    with (registry / 'connector-status.csv').open('w', newline='') as output:
        writer = csv.DictWriter(output, fieldnames=list(rows[0]) if rows else ['group_id', 'group', 'connector_id', 'connector', 'status', 'passing_examples', 'tested_search_scope', 'known_limitations', 'next_step_or_blocker', 'block_reason', 'last_attempt_and_result', 'recovery_decision', 'last_reviewed_at', 'record', 'production_activation_changed'], lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps(totals))
    return result


if __name__ == '__main__':
    generate()
