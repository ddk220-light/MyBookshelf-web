"""Offline registry proposals and precomputed review metrics. Never invokes a provider."""
import csv
import hashlib
import json
import pathlib
from collections import Counter, defaultdict
from migrations import canonical, version_id


def rows(db, sql, args=()):
    return [dict(r) for r in db.execute(sql, args)]


def decoded(value, default=None):
    return json.loads(value) if value else default


def evidence_snapshot(db):
    # Source offsets and hashes identify the imported evidence, not the wall clock.
    sources = rows(db, 'SELECT path,offset,sha256 FROM sources ORDER BY path')
    return hashlib.sha256(canonical(sources).encode()).hexdigest()


def connection_proposals(db, library_id=None):
    output = defaultdict(list)
    for c in db.execute('SELECT * FROM connections'+(' WHERE library_id=?' if library_id else '')+' ORDER BY library_id,label', (library_id,) if library_id else ()):
        config = json.loads(c['config_json']); entry = config.get('directoryEntry', {})
        vid = version_id(c['library_id'], c['label'], c['fingerprint'])
        runtime = db.execute('SELECT descriptor_json FROM runtime_inventory WHERE version_id=?', (vid,)).fetchone()
        runtime = decoded(runtime[0], {}) if runtime else {}
        assessments = rows(db, "SELECT c.*,json_extract(e.raw_json,'$.appImplementationFingerprint') app_implementation_fingerprint, "
                           "coalesce(json_extract(e.raw_json,'$.field'),json_extract(e.raw_json,'$.profile.field')) tested_field "
                           "FROM checks c JOIN events e ON e.id=c.id WHERE c.library_id=? AND c.connection_label=? AND c.kind='app' "
                           "AND c.observation_kind='live_http' AND c.status!='Interrupted' "
                           "AND NOT EXISTS(SELECT 1 FROM invalidations i WHERE i.source_event_id=c.id) "
                           "ORDER BY julianday(c.observed_at) DESC,c.id DESC", (c['library_id'], c['label']))
        last = assessments[0] if assessments else None
        implementation_matches=bool(runtime.get('implementationFingerprint') and last and last['app_implementation_fingerprint']==runtime['implementationFingerprint'])
        eligible = bool(last and last['status'] == 'Working' and last['configuration_fingerprint'] == c['fingerprint'] and implementation_matches)
        reason = ('live_app_search_verified_current_configuration' if eligible else
                  'no_live_app_search_assessment' if not last else
                  'connection_changed_since_app_check' if last['configuration_fingerprint'] != c['fingerprint'] else
                  'latest_app_assessment_not_working' if last['status']!='Working' else 'no_current_app_implementation_proof')
        methods = runtime.get('methods', [])
        gaps = []
        if not runtime: gaps.append('runtime_not_inspected')
        else:
            if 'searchCatalog' not in methods: gaps.append('app_catalog_search_method_missing')
            if 'resolveCatalogRecord' not in methods: gaps.append('app_record_resolution_missing')
            if not runtime.get('publicCapabilities', {}).get('titleSearch'): gaps.append('app_title_search_not_exposed')
        if config.get('mode') == 'unsupported': gaps.append('audit_method_unsupported')
        if not eligible: gaps.append('audit_to_app_alignment_unverified')
        output[c['library_id']].append({
            'connectionId': c['id'], 'label': c['label'], 'versionId': vid,
            'configurationFingerprint': c['fingerprint'],
            'routeIdentity': entry.get('sourceConnectionId') or entry.get('researchId') or entry.get('networkConnectionId'),
            'catalogSystem': (runtime.get('auditProfile') or {}).get('kind') or config.get('family'), 'adapterFamily':config.get('family'),
            'auditMethod': {'family': config.get('family'), 'mode': config.get('mode'),
                            'profile': runtime.get('auditProfile'), 'fields': config.get('fields', []),
                            'paging': config.get('paging'), 'adapterVersion': config.get('adapterVersion')},
            'appAdapter': runtime or None, 'scope': {'memberCode': config.get('memberCode'), 'cluster': config.get('cluster')},
            'configuration': config, 'eligible': eligible, 'eligibilityReason': reason,
            'verifiedSearchFields': [last['tested_field']] if eligible and last.get('tested_field') else [],
            'latestAppAssessment': last, 'lastSuccessfulAppAssessment': next((a for a in assessments if a['status'] == 'Working'), None),
            'readinessGaps': gaps,
        })
    return output


def refresh(db):
    """Rebuild derived caches once after an import. Observations are never changed."""
    db.execute('DELETE FROM review_records')
    db.execute('''INSERT INTO review_records
      WITH latest AS (SELECT id,record_key,observed_at,row_number() OVER(PARTITION BY record_key ORDER BY julianday(observed_at) DESC,id DESC) n FROM record_observations),
      history AS (SELECT record_key,min(observed_at) first_seen,max(observed_at) last_seen,count(*) observations FROM record_observations GROUP BY record_key),
      decisions AS (SELECT o.record_key,d.decision,o.observed_at,
        row_number() OVER(PARTITION BY o.record_key ORDER BY julianday(o.observed_at) DESC,d.event_id DESC) n
        FROM book_decisions d JOIN record_observations o ON o.id=d.observation_id
        WHERE NOT EXISTS(SELECT 1 FROM invalidations i WHERE i.source_event_id=d.event_id)),
      accepted AS (SELECT o.record_key,max(o.observed_at) last_validation FROM book_decisions d
        JOIN record_observations o ON o.id=d.observation_id WHERE d.decision='book_accepted'
        AND NOT EXISTS(SELECT 1 FROM invalidations i WHERE i.source_event_id=d.event_id) GROUP BY o.record_key)
      SELECT l.record_key,l.id,h.first_seen,h.last_seen,h.observations,d.decision,a.last_validation,d.observed_at
      FROM latest l JOIN history h ON h.record_key=l.record_key LEFT JOIN decisions d ON d.record_key=l.record_key AND d.n=1
      LEFT JOIN accepted a ON a.record_key=l.record_key WHERE l.n=1''')
    stats = {r['library_id']: dict(r) for r in db.execute('''SELECT library_id,
      count(*) query_observations,sum(outcome='success') successful_queries,sum(outcome='empty') empty_queries,
      sum(outcome='failed') failed_queries,sum(outcome='interrupted') interrupted_queries,
      sum(returned) returned_candidates, count(wall_ms) timed_queries,avg(wall_ms) average_response_ms,
      count(DISTINCT CASE WHEN outcome='success' THEN query END) nonempty_search_terms,
      count(DISTINCT query) tested_search_terms FROM searches GROUP BY library_id''')}
    relevance = {r['library_id']: dict(r) for r in db.execute('''SELECT s.library_id,
      sum(q.relevant=1) relevant_candidates,sum(q.relevant=0) unrelated_candidates,
      sum(q.relevant IS NULL) unassessed_candidates,count(DISTINCT CASE WHEN q.relevant=1 THEN s.query END) relevant_matched_search_terms
      FROM searches s JOIN query_results q ON q.search_id=s.id GROUP BY s.library_id''')}
    records = {r['library_id']: dict(r) for r in db.execute('''SELECT r.library_id,
      count(*) observed_catalog_identities,sum(r.identity_kind='native_bibliographic') observed_bibliographic_records,
      sum(r.identity_kind='copy') copy_identities,sum(r.identity_kind='fingerprint') fingerprint_identities,
      sum(r.identity_kind='native_bibliographic' AND c.decision='book_accepted') accepted_bibliographic_records,
      sum(coalesce(nullif(o.authors_json,'[]'),m.authors_json) IS NOT NULL) records_with_authors,
      sum(coalesce(o.edition,m.edition) IS NOT NULL) records_with_edition,
      sum(coalesce(o.language,m.language) IS NOT NULL) records_with_language,
      sum(coalesce(o.publication_year,m.publication_year) IS NOT NULL) records_with_year,
      sum(coalesce(o.publisher,m.publisher) IS NOT NULL) records_with_publisher
      FROM catalog_records r JOIN review_records c ON c.record_key=r.id
      JOIN record_observations o ON o.id=c.observation_id LEFT JOIN metadata_extractions m ON m.observation_id=o.id GROUP BY r.library_id''')}
    proposals = connection_proposals(db)
    counts = Counter(); systems = {}; countries = {}; db.execute('DELETE FROM review_libraries')
    for row in db.execute('SELECT * FROM library_current ORDER BY library_id').fetchall():
        data = dict(row); lib = data['library_id']; data.pop('last_check_age_days', None)
        metrics = {**stats.get(lib, {}), **relevance.get(lib, {}), **records.get(lib, {})}; metrics.pop('library_id', None)
        # This cache records source dates. Age is computed at read time.
        data['metrics'] = metrics
        data['app_eligible'] = int(any(c['eligible'] for c in proposals[lib]))
        data['eligibility_reason'] = 'live_app_search_verified_current_configuration' if data['app_eligible'] else 'no_current_configuration_live_app_search_proof'
        data['connection_readiness_gaps'] = sorted(set(g for c in proposals[lib] for g in c['readinessGaps']))
        db.execute('INSERT INTO review_libraries VALUES(?,?,?,?,?,?,?,?)',
                   (lib,data['name'],data['country'],data['system'],data['status'],data['app_eligible'],data['last_check'],canonical(data)))
        counts[data['status']] += 1
        for buckets,key in [(systems,data['system']),(countries,data['country'])]:
            bucket=buckets.setdefault(key,Counter());bucket['total']+=1;bucket[data['status']]+=1;bucket['app_eligible']+=data['app_eligible']
    def percentile(values, p):
        return values[min(len(values)-1, max(0, __import__('math').ceil(len(values)*p)-1))] if values else None
    latencies=[r[0] for r in db.execute('SELECT wall_ms FROM searches WHERE wall_ms IS NOT NULL AND wall_ms>=0 ORDER BY wall_ms')]
    totals={}
    for source in (stats,relevance,records):
        for data in source.values():
            for k,v in data.items():
                if k not in ('library_id','average_response_ms') and v is not None:totals[k]=totals.get(k,0)+v
    summary={'schemaVersion':2,'evidenceSnapshot':evidence_snapshot(db),'nativeStatuses':dict(counts),
             'libraries':sum(counts.values()),'connections':sum(map(len,proposals.values())),
             'appEligible':sum(c['app_eligible'] for c in countries.values()),'byCountry':countries,'bySystem':systems,
             'metrics':totals,'responseTimeMs':{'observations':len(latencies),'p50':percentile(latencies,.5),'p95':percentile(latencies,.95)},
             'limitations':['Observed records are a sample, not complete holdings or current borrowing availability.',
                             'An empty query is not proof that a library lacks a book.',
                             'Native results, relevant-book decisions, app proof and item-link checks are separate.',
                             'Connection history is known only where a configuration snapshot was preserved.']}
    summary['itemLinks']={r['outcome']:r['n'] for r in db.execute('''WITH ranked AS (
      SELECT outcome,row_number() OVER(PARTITION BY library_id,url ORDER BY julianday(observed_at) DESC,event_id DESC) n FROM link_checks)
      SELECT coalesce(outcome,'unknown') outcome,count(*) n FROM ranked WHERE n=1 GROUP BY outcome''')}
    summary['unknownHistoricalConfigurations']=db.execute("SELECT count(*) FROM searches s JOIN events e ON e.id=s.id WHERE coalesce(json_extract(e.raw_json,'$.configurationFingerprint'),json_extract(s.profile_json,'$.configurationFingerprint')) IS NULL").fetchone()[0]
    db.execute('INSERT OR REPLACE INTO review_cache VALUES(?,?)',('summary',canonical(summary)))
    db.execute("INSERT OR REPLACE INTO review_cache VALUES('refreshedAt',json_quote(strftime('%Y-%m-%dT%H:%M:%fZ','now')))")
    db.commit()
    return summary


def export_registry(db, out):
    out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True)
    proposals=connection_proposals(db);libraries=[]
    for row in db.execute('SELECT data_json FROM review_libraries ORDER BY library_id'):
        data=json.loads(row[0]);data['connections']=proposals[data['library_id']];libraries.append(data)
    aliases={r[0]:r[1] for r in db.execute('SELECT alias,library_id FROM aliases ORDER BY alias')}
    payload={'schemaVersion':1,'databaseSchemaVersion':2,'purpose':'proposal_only','evidenceSnapshot':evidence_snapshot(db),
             'libraries':libraries,'aliases':aliases}
    snapshot=hashlib.sha256(canonical(payload).encode()).hexdigest();payload['snapshotId']=snapshot
    artifacts={
        'library-registry.json':payload,
        'eligible-library-proposal.json':{'schemaVersion':1,'purpose':'proposal_only','snapshotId':snapshot,
            'aliases':{a:target for a,target in aliases.items() if any(l['library_id']==target and l['app_eligible'] for l in libraries)},
            'libraries':[{**l,'connections':[c for c in l['connections'] if c['eligible']]} for l in libraries if l['app_eligible']]},
        'analysis-summary.json':json.loads(db.execute("SELECT value_json FROM review_cache WHERE key='summary'").fetchone()[0]),
        'connection-versions.json':rows(db,'SELECT * FROM connection_versions ORDER BY library_id,label,id'),
    }
    for name,artifact in artifacts.items():(out/name).write_text((canonical(artifact) if name=='library-registry.json' else json.dumps(artifact,ensure_ascii=False,indent=2))+'\n')
    with (out/'connection-readiness.csv').open('w',newline='') as f:
        writer=csv.writer(f);writer.writerow(['library_id','country','system','connection_label','version_id','audit_mode','runtime_methods','public_title_search','eligible','reason','gaps'])
        for lib in libraries:
            for c in lib['connections']:
                runtime=c['appAdapter'] or {}
                writer.writerow([lib['library_id'],lib['country'],c['catalogSystem'],c['label'],c['versionId'],c['auditMethod']['mode'],canonical(runtime.get('methods',[])),runtime.get('publicCapabilities',{}).get('titleSearch'),c['eligible'],c['eligibilityReason'],canonical(c['readinessGaps'])])
    manifest={name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in [*artifacts,'connection-readiness.csv']}
    (out/'registry-manifest.json').write_text(json.dumps({'snapshotId':snapshot,'sha256':manifest},indent=2)+'\n')
    report=artifacts['analysis-summary.json']
    lines=['# Library analysis snapshot','',f"Libraries: {len(libraries):,}. Connections: {sum(len(l['connections']) for l in libraries):,}. Proposed app-eligible libraries: {len(artifacts['eligible-library-proposal.json']['libraries']):,}.",
           '', 'Native Working describes saved catalog evidence; it does not establish live app search or item-link success.', '',
           '| Country | Total | Working | Needs work | Blocked/deferred | Not checked | App eligible |',
           '|---|---:|---:|---:|---:|---:|---:|']
    for country,c in sorted(report['byCountry'].items()):lines.append('| '+country+' | '+' | '.join(str(c.get(k,0)) for k in ['total','Working','Needs work','Blocked/deferred','Not checked','app_eligible'])+' |')
    lines+=['','## Observed sample','']+[f'- {k.replace("_"," ")}: {v:,}' for k,v in sorted(report['metrics'].items())]
    lines+=['','## Interpretation','']+['- '+v for v in report['limitations']]
    (out/'analysis-summary.md').write_text('\n'.join(lines)+'\n')
    manifest['analysis-summary.md']=hashlib.sha256((out/'analysis-summary.md').read_bytes()).hexdigest()
    (out/'registry-manifest.json').write_text(json.dumps({'snapshotId':snapshot,'sha256':manifest},indent=2)+'\n')
    return {'snapshotId':snapshot,'libraries':len(libraries),'connections':sum(len(l['connections']) for l in libraries),
            'eligible':len(artifacts['eligible-library-proposal.json']['libraries'])}
