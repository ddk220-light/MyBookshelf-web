#!/usr/bin/env python3
"""Offline access classification. Never imports provider code or makes network calls."""
import argparse
import collections
import csv
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
AUDIT = 'docs/research/india-library-audit'
FULL = AUDIT + '/runs/india-20261107'
REPAIR = AUDIT + '/revalidation/20261107'
OUT = AUDIT + '/access-classification'
CATEGORIES = {1: 'Structured-access candidates', 2: 'Shared website connector candidates',
              3: 'Individual connector work', 4: 'Deferred'}
BLOCK_CLASSES = {'confirmed_policy_block', 'confirmed_policy_or_access_block',
                 'observed_connection_or_http_block'}
BLOCK_CODES = {'ROBOTS_DISALLOWED', 'ROBOTS_UNAVAILABLE', 'SOURCE_ACCESS_BLOCKED',
               'CATALOG_PROVIDER_BLOCKED', 'CATALOG_UNAVAILABLE', 'UPSTREAM_TIMEOUT',
               'PROVIDER_COOLDOWN'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def complete_events(path):
    """Never turn a truncated event into evidence; count it explicitly."""
    data = path.read_bytes()
    lines = data.splitlines(keepends=True)
    trailing = bool(lines and not lines[-1].endswith(b'\n'))
    if trailing:
        lines.pop()
    return [json.loads(line) for line in lines if line.strip()], int(trailing)


def directory(root):
    merged = {}
    discovered = None
    for name in ['libraries', 'india-catalogs', 'discovered-catalogs']:
        data = read_json(root / f'server/data/{name}.json')
        for row in data if isinstance(data, list) else data['libraries']:
            key = row.get('directoryId') or row['platform'] + ':' + row['slug']
            merged[key] = dict(row)
        if name == 'discovered-catalogs':
            discovered = data
    for item in discovered['alternates']:
        merged[item['libraryId']].setdefault('alternateCatalogs', []).append(item['entry'])
    return merged


def system_key(library_id, connection, entry, academic):
    family = connection['family']
    if family == 'discovery-academic':
        return 'academic:' + academic.get(entry.get('academicCatalogId'), {}).get('kind', 'unknown')
    if family == 'discovery-community':
        return 'community:' + entry.get('communityCatalog', {}).get('family', 'unknown')
    if family == 'catalog':
        host = urlparse(connection.get('catalogUrl') or '').hostname or ''
        if host == 'portal.vmedulife.com':
            return 'vmedulife'
        if host.endswith('.slimkm.org'):
            return 'slim'
        if host.endswith('.libsys10.in'):
            return 'libsys'
        return 'individual'
    return family


def choose_category(routes):
    """A blocked primary never hides an available candidate alternative."""
    eligible = [r for r in routes if not r['blocker']]
    if eligible:
        return min(eligible, key=lambda r: (r['candidateCategory'], r['connectionId'] != 'primary'))
    return min(routes, key=lambda r: (r['candidateCategory'], r['connectionId'] != 'primary'))


def blocker_for(review, replay, connection_id, last_event):
    """Reviewed library outcomes override old false failures on its primary route."""
    if connection_id == 'primary' and review:
        if review['classification'] not in BLOCK_CLASSES:
            return None
        code = review.get('code') or replay.get('diagnosedCode') or 'SAVED_ACCESS_BLOCK'
        reason = review.get('reason') or 'Saved access or transport restriction'
        if code == 'ROBOTS_DISALLOWED':
            reason = 'Saved robots rules restrict the tested automated search route.'
        elif code == 'ROBOTS_UNAVAILABLE':
            reason = 'The previous check could not establish robots policy.'
        return {'code': code, 'reason': reason, 'observedAt': review.get('sourceObservedThrough'),
                'basis': 'current_reviewed_outcome', 'permanentFailure': False}
    if last_event and last_event['type'] == 'search_failed' and last_event.get('code') in BLOCK_CODES:
        return {'code': last_event['code'], 'reason': last_event.get('reason', ''),
                'observedAt': last_event['at'], 'basis': 'saved_route_search_failure',
                'permanentFailure': False}
    return None


def route_verification(review, connection_id, positive, scoped_probe):
    if scoped_probe and connection_id == 'primary':
        return 'previously_demonstrated', 'saved_structured_probe'
    if connection_id == 'primary' and review and review['classification'].startswith('verified_'):
        return 'previously_demonstrated', review['classification']
    # An old search response alone may predate parser/scope corrections.
    return 'candidate', 'saved_unqualified_results' if positive else 'not_demonstrated'


def build(root=ROOT, output=None):
    output = output or root / OUT
    systems_path = root / OUT / 'systems.json'
    systems = read_json(systems_path)
    manifest = read_json(root / FULL / 'manifest.json')
    inventory = manifest['inventory']
    libraries = inventory['libraries']
    ids = {x['libraryId'] for x in libraries}
    assert len(ids) == len(libraries) == inventory['total'] == 6703
    # JS JSON.stringify compatibility for this JSON-only frozen inventory.
    encoded = json.dumps(libraries, ensure_ascii=False, separators=(',', ':')).encode()
    assert hashlib.sha256(encoded).hexdigest() == inventory['inventoryHash'], 'Frozen inventory hash mismatch'
    current = directory(root)
    academic = read_json(root / 'server/services/providers/discoveryAcademicConfigs.json')
    review_path = root / REPAIR / 'revalidation-status.csv'
    with review_path.open(encoding='utf-8', newline='') as review_file:
        reviews = {r['libraryId']: r for r in csv.DictReader(review_file)}
    assert set(reviews) <= ids, 'Reviewed ID outside frozen inventory'
    replay = {r['libraryId']: r for r in read_json(root / REPAIR / 'replay-review.json')['libraries']}
    latest = {}
    positives = {}
    last_failures = {}
    evidence = {}
    tail_count = 0
    source_events = 0
    checked_bodies = {}
    used_evidence = set()
    input_paths = [FULL+'/manifest.json', REPAIR+'/revalidation-status.csv',
                   REPAIR+'/replay-review.json', OUT+'/systems.json',
                   'server/data/libraries.json', 'server/data/india-catalogs.json',
                   'server/data/discovered-catalogs.json', 'server/services/providers/discoveryAcademicConfigs.json',
                   AUDIT+'/koha-interface-check-20261108/analysis.json',
                   'tools/library-classification/classify.py']
    for profile in systems['systems'].values():
        assert profile['category'] in (1, 2, 3)
        for ref in profile['evidence']:
            if not ref.startswith('https://'):
                if not (root / ref).is_file():
                    raise ValueError('Missing system evidence: ' + ref)
                input_paths.append(ref)
    input_paths = list(dict.fromkeys(input_paths))

    def evidence_ref(event, source):
        refs = []
        for e in event.get('evidence', []):
            candidates = [root / source / e['path'], root / FULL / e['path'], root / REPAIR / e['path']]
            existing = next((x for x in candidates if x.exists()), None)
            if existing is None:
                raise ValueError(f"Missing source evidence {e['sha256']}")
            path = str(existing.relative_to(root))
            if path not in checked_bodies:
                checked_bodies[path] = digest(existing)
            if checked_bodies[path] != e['sha256']:
                raise ValueError(f'Corrupt source evidence {path}')
            refs.append({'path': path, 'sha256': e['sha256']})
        key = event['eventId']
        evidence[key] = {'eventId': key, 'observedAt': event['at'], 'type': event['type'],
                         'source': source+'/events.jsonl', 'evidence': refs,
                         'query': event.get('query'), 'code': event.get('code'),
                         'returned': len(event.get('records', [])), 'fidelity': event.get('fidelity')}
        return key

    for source in [FULL, REPAIR]:
        input_paths.append(source+'/events.jsonl')
        events, tails = complete_events(root / source / 'events.jsonl')
        tail_count += tails
        source_events += len(events)
        for e in events:
            if e.get('libraryId') not in ids or e['type'] not in ['search_completed', 'search_failed']:
                continue
            key = (e['libraryId'], e.get('connectionId', 'primary'))
            evidence_ref(e, source)
            if key not in latest or e['at'] >= latest[key]['at']:
                latest[key] = e
            if e['type'] == 'search_failed':
                last_failures[key] = e
            elif e.get('records'):
                positives[key] = e

    koha = read_json(root / AUDIT / 'koha-interface-check-20261108/analysis.json')
    koha_ids = {r['libraryId'] for r in koha['libraries'] if r['firstPage']['sameOrderedNativeIDs'] and r['rest']['requestedIDMatches999c']}
    # Verify the already captured five-library structured proof, never re-query it.
    def validate_nested(v, base):
        if isinstance(v, dict):
            if 'sha256' in v and 'path' in v:
                p = root / base / v['path']
                if not p.exists() or digest(p) != v['sha256']:
                    raise ValueError(f'Missing/mismatched structured evidence: {p}')
            for x in v.values():
                validate_nested(x, base)
        elif isinstance(v, list):
            for x in v:
                validate_nested(x, base)
    validate_nested(koha, AUDIT+'/koha-interface-check-20261108')

    rows = []
    unresolved = []
    for library in libraries:
        lid = library['libraryId']
        entry = current.get(lid, {})
        current_routes = [entry] + entry.get('alternateCatalogs', [])
        reviewed = reviews.get(lid)
        routes = []
        for n, connection in enumerate(library['connections']):
            cid = connection['connectionId']
            active = current_routes[n] if n < len(current_routes) else {}
            mapping_matches = active.get('platform') == connection['family'] and active.get('catalogUrl') == connection.get('catalogUrl')
            if not mapping_matches:
                unresolved.append({'libraryId': lid, 'connectionId': cid, 'reason': 'Current configuration differs from frozen route; use frozen family only'})
                active = {}
            system = system_key(lid, connection, active, academic)
            profile = systems['systems'].get(system)
            if profile is None:
                unresolved.append({'libraryId': lid, 'connectionId': cid, 'reason': 'Unmapped subtype '+system})
                system = 'individual'
                profile = systems['systems'][system]
            key = (lid, cid)
            last = latest.get(key)
            positive = positives.get(key)
            block = blocker_for(reviewed, replay.get(lid, {}), cid, last)
            verification, basis = route_verification(reviewed, cid, positive, lid in koha_ids)
            if block:
                verification, basis = 'candidate', 'blocked_saved_route'
            refs = []
            for event in [last, positive, last_failures.get(key)]:
                if event and event['eventId'] not in refs:
                    refs.append(event['eventId']);used_evidence.add(event['eventId'])
            route = {'connectionId': cid, 'frozenFamily': connection['family'], 'system': system,
                     'catalogUrl': connection.get('catalogUrl'), 'origins': connection['origins'],
                     'memberCode': connection.get('memberCode'), 'cluster': connection.get('cluster'),
                     'candidateCategory': profile['category'], 'method': profile['method'],
                     'structuredUpgrade': profile.get('structuredUpgrade'),
                     'verificationStatus': verification, 'verificationBasis': basis,
                     'blocker': block, 'evidenceEventIds': refs,
                     'systemEvidenceRef': OUT+'/systems.json#/systems/'+system,
                     'structuredSearchVerification': 'saved_probe_pass' if lid in koha_ids and cid == 'primary' else 'not_established_per_library',
                     'nextAction': profile['nextAction']}
            if block:
                route['nextAction'] = ('Review permitted search alternatives or documented permission changes; do not repeat the refused route.'
                    if block['code'] in {'ROBOTS_DISALLOWED','SOURCE_ACCESS_BLOCKED','CATALOG_PROVIDER_BLOCKED'}
                    else 'Defer this observed route failure; recheck only on observed recovery or a meaningful request/configuration change. Not proof the library is offline.')
            if lid in koha_ids and cid == 'primary':
                route['structuredProbeEvidence'] = AUDIT+'/koha-interface-check-20261108/analysis.json'
            routes.append(route)
        selected = choose_category(routes)
        category = 4 if all(r['blocker'] for r in routes) else selected['candidateCategory']
        book_count = int(reviewed.get('books') or 0) if reviewed else 0
        rows.append({'libraryId': lid, 'name': library['name'], 'region': library.get('region'),
                     'primarySystem': routes[0]['system'], 'primaryFamily': library['connections'][0]['family'],
                     'category': category, 'categoryName': CATEGORIES[category],
                     'preferredConnectionId': selected['connectionId'], 'preferredSystem': selected['system'],
                     'preferredMethod': selected['method'], 'verificationStatus': selected['verificationStatus'],
                     'releaseReady': False, 'liveChecksPerformedForClassification': 0,
                     'sourceReviewedOutcome': reviewed,
                     'sourceReviewPath': REPAIR+'/revalidation-status.csv' if reviewed else None,
                     'priorNativeBookBenchmark': book_count,
                     'nextAction': selected['nextAction'], 'routes': routes})
    output.mkdir(parents=True, exist_ok=True)
    with (output/'libraries.jsonl').open('w', encoding='utf-8') as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(',', ':'))+'\n')
    columns = ['libraryId','name','region','primaryFamily','primarySystem','category','categoryName',
               'preferredConnectionId','preferredSystem','preferredMethod','verificationStatus',
               'releaseReady','sourceObservedThrough','blockerCodes','nextAction','alternatives']
    flat = []
    for row in rows:
        r = {k: row.get(k) for k in columns}
        r['sourceObservedThrough'] = (row['sourceReviewedOutcome'] or {}).get('sourceObservedThrough','')
        r['blockerCodes'] = '; '.join(sorted({x['blocker']['code'] for x in row['routes'] if x['blocker']}))
        r['alternatives'] = '; '.join(x['connectionId']+':'+x['system']+(' [deferred]' if x['blocker'] else ' [candidate]') for x in row['routes'] if x['connectionId'] != row['preferredConnectionId'])
        flat.append(r)
    def csv_file(name, data, fields):
        with (output/name).open('w',newline='',encoding='utf-8') as f:
            w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader();w.writerows(data)
    csv_file('libraries.csv', flat, columns)
    csv_file('deferred.csv', [r for r in flat if r['category']==4], columns)
    route_blocks = [{'libraryId': r['libraryId'],'name':r['name'],'category':r['category'],
                     'connectionId':x['connectionId'],'system':x['system'],**x['blocker'],'nextAction':x['nextAction']}
                    for r in rows for x in r['routes'] if x['blocker']]
    csv_file('blocked-routes.csv', route_blocks, ['libraryId','name','category','connectionId','system','code','reason','observedAt','basis','permanentFailure','nextAction'])
    system_rows=[]
    for family in sorted({r['primarySystem'] for r in rows}):
        own=[r for r in rows if r['primarySystem']==family]
        system_rows.append({'system':family,'libraries':len(own),**{f'category{c}':sum(r['category']==c for r in own) for c in CATEGORIES},
                            'previouslyDemonstrated':sum(r['verificationStatus']=='previously_demonstrated' for r in own)})
    csv_file('systems.csv',system_rows,['system','libraries','category1','category2','category3','category4','previouslyDemonstrated'])
    inputs=[{'path':x,'sha256':digest(root/x)} for x in input_paths]
    summary={'schemaVersion':1,'classificationDate':systems['reviewedAt'],'method':'offline_inventory_and_saved_evidence_only',
             'totalLibraries':len(rows),'frozenInventoryHash':inventory['inventoryHash'],
             'categoryCounts':{str(c):sum(r['category']==c for r in rows) for c in CATEGORIES},
             'categories':CATEGORIES,'primaryFamilyCounts':dict(collections.Counter(r['primaryFamily'] for r in rows)),
             'verificationCounts':dict(collections.Counter(r['verificationStatus'] for r in rows)),
             'preferredAlternativeCount':sum(r['preferredConnectionId']!='primary' for r in rows),
             'librariesWithAlternatives':sum(len(r['routes'])>1 for r in rows),
             'blockedRouteCount':len(route_blocks),'deferredLibraryCauses':dict(collections.Counter(r['blockerCodes'] for r in flat if r['category']==4)),
             'egranthalaya':{'primaryLibraries':sum(r['primaryFamily']=='egranthalaya' for r in rows),'clusters':len({x['connections'][0]['cluster'] for x in libraries if x['connections'][0]['family']=='egranthalaya'}),
                            'publicAnonymousSearchApi':'not_established','fallback':'shared_member_scoped_html_search'},
             'unresolvedMappings':unresolved,'ignoredIncompleteJournalTails':tail_count,
             'sourceJournalEventsRead':source_events,'sourceEvidenceBodiesValidated':len(checked_bodies),
             'providerRequests':0,'newVerifiedLibraries':0,'releaseReadyLibraries':0,
             'fullAuditResumed':False,'schedulesChanged':False,'productionChanges':False,'inputs':inputs}
    write_json(output/'summary.json',summary)
    write_json(output/'evidence-index.json', {k:evidence[k] for k in sorted(used_evidence)})
    write_json(output/'coverage-audit.json',{'allFrozenIdsCaptured':ids=={r['libraryId'] for r in rows},
        'knownFrozenConnections':sum(len(x['connections']) for x in libraries),'capturedConnections':sum(len(x['routes']) for x in rows),
        'everyEntryHasNextAction':all(r['nextAction'] for r in rows),'unresolvedMappings':unresolved,
        'classificationFieldsComplete':True,
        'remainingVerification':'Per-library structured endpoint enablement, supported scope, actual queries and item access are NOT established by this offline classification.',
        'notCompletionOfTwentyBookAudit':True})
    lines=['# Library access classification — '+systems['reviewedAt'],'',
           '**Offline classification of all 6,703 frozen entries. No new provider requests, connector changes or audit restart.**','',
           '| Category | Libraries |','|---|---:|']
    for c in CATEGORIES:
        lines.append(f"| {c}. {CATEGORIES[c]} | {summary['categoryCounts'][str(c)]:,} |")
    lines += ['', 'Categories describe the best known access route, not production readiness. Previously demonstrated results retain their source dates. No entry gains a new search pass from this classification.', '',
              '| Primary system | Total | Structured | Shared website | Individual work | Deferred |', '|---|---:|---:|---:|---:|---:|']
    for s in sorted(system_rows,key=lambda x:-x['libraries']):
        lines.append('| '+s['system']+' | '+' | '.join(str(s[k]) for k in ['libraries','category1','category2','category3','category4'])+' |')
    lines += ['', '## e-Granthalaya', '',
              'The 5,036 primary entries share eg4.nic.in across 62 clusters. Existing member-scoped HTML search is a reusable method. NIC documents XML/JSON web services and registered-user catalog exports, but anonymous library-scoped search API access is not established. External-catalog importing and RFID APIs are not proof of public search access. Keep the structured upgrade lead open; do not build thousands of individual connectors.', '',
              '## Decisions and limits', '',
              '- Categories 1 and 2 are eligible for later verification and eventual initial release. Neither is automatically working.',
              '- IndCat SRU needs per-institution holdings proof. VuFind API enablement varies. Koha has five saved structured probes; other installations remain candidates. Previously demonstrated native HTML results do not verify a different API.',
              '- Libman has a shared website JSON method. Its advertised secured integration API is an upgrade lead, not verified anonymous catalog search.',
              '- A blocked primary does not hide a candidate alternate. Category 4 requires every frozen route to have a saved restriction or access/transport failure. Standard protocol documentation alone does not establish a permitted alternative at that provider.',
              '- Missing adapters, unknown material types and unchecked libraries are not source failures. Empty tested searches are not blockers.',
              '- Historical robots restrictions and HTTP failures describe the tested route and observation date; they do not establish that the library is offline today.',
              '- Subtypes with reusable existing implementations are category 2 even when their full twenty-book/app/link evidence is incomplete. Unsupported or unmapped methods stay category 3; shared software branding alone is not enough.',
              '- The separate original audit gate, goals and paused schedules remain unchanged. Later execution needs a bounded pilot, not a blanket restart.', '',
              '## Files', '',
              '- [All libraries CSV](libraries.csv) · [JSONL](libraries.jsonl)',
              '- [System totals](systems.csv) · [Summary](summary.json)',
              '- [Deferred libraries](deferred.csv) · [All blocked routes, including libraries with alternatives](blocked-routes.csv)',
              '- [System evidence and policy](systems.json) · [Saved query evidence index](evidence-index.json) · [Coverage audit](coverage-audit.json)', '',
              '## Reproduce without network access', '',
              '```sh', 'python tools/library-classification/classify.py build', 'python tools/library-classification/classify.py validate',
              "python -m unittest discover -s tools/library-classification -p 'test_*.py'", '```','']
    (output/'REPORT.md').write_text('\n'.join(lines),encoding='utf-8')
    validate(root,output)
    return summary


def validate(root=ROOT, output=None):
    output=output or root/OUT
    s=read_json(output/'summary.json')
    for f in s['inputs']:
        if not (root/f['path']).exists() or digest(root/f['path'])!=f['sha256']:
            raise ValueError('Classification input changed or missing: '+f['path'])
    rows=[json.loads(l) for l in (output/'libraries.jsonl').read_text().splitlines()]
    source=read_json(root/FULL/'manifest.json')['inventory']['libraries']
    assert {r['libraryId'] for r in rows}=={r['libraryId'] for r in source}
    assert len(rows)==len({r['libraryId'] for r in rows})==6703
    assert sum(s['categoryCounts'].values())==len(rows)
    for r in rows:
        assert not r['releaseReady'] and r['liveChecksPerformedForClassification']==0
        chosen=choose_category(r['routes'])
        assert chosen['connectionId']==r['preferredConnectionId']
        assert r['category']==(4 if all(x['blocker'] for x in r['routes']) else chosen['candidateCategory'])
    source_by_id={x['libraryId']:x for x in source}
    evidence=read_json(output/'evidence-index.json')
    for r in rows:
        frozen=source_by_id[r['libraryId']]['connections']
        assert len(r['routes'])==len(frozen)
        for route, original in zip(r['routes'],frozen):
            assert route['connectionId']==original['connectionId']
            assert route['frozenFamily']==original['family']
            assert route['catalogUrl']==original.get('catalogUrl')
            assert all(x in evidence for x in route['evidenceEventIds'])
    for ref in read_json(output/'evidence-index.json').values():
        for b in ref['evidence']:
            if not (root/b['path']).exists() or digest(root/b['path'])!=b['sha256']:
                raise ValueError('Missing/mismatched saved query evidence: '+b['path'])
    with (output/'libraries.csv').open(encoding='utf-8', newline='') as csv_file:
        csvrows=list(csv.DictReader(csv_file))
    assert len(csvrows)==len(rows)
    assert {r['libraryId'] for r in csvrows}=={r['libraryId'] for r in rows}
    by_id={r['libraryId']:r for r in rows}
    assert all(int(r['category'])==by_id[r['libraryId']]['category'] for r in csvrows)
    coverage=read_json(output/'coverage-audit.json')
    assert coverage['knownFrozenConnections']==coverage['capturedConnections']==sum(len(x['connections']) for x in source)
    assert all(sum(r['category']==c for r in rows)==s['categoryCounts'][str(c)] for c in CATEGORIES)
    assert not s['providerRequests'] and not s['newVerifiedLibraries']
    return {'valid':True,'libraries':len(rows),'categories':s['categoryCounts'],'providerRequests':0}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['build','validate'])
    args=parser.parse_args()
    result=build() if args.command=='build' else validate()
    print(json.dumps({k:result[k] for k in ['totalLibraries','categoryCounts','unresolvedMappings','valid','libraries','categories','providerRequests'] if k in result},indent=2))
