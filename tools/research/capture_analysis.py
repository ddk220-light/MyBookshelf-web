#!/usr/bin/env python3
"""Capture existing research losslessly and report completion gaps, offline."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess

from source_registry import ROOT, REGISTRY, current_verified, area_verified, observations
from jsonl_io import read_jsonl

RESEARCH = ROOT / 'docs/research/free-content'
CORPUS_ROOTS = ['docs/research/free-content', 'docs/design/2026-11-free-content']
TEXT_SUFFIXES = {'.md', '.json', '.jsonl', '.html', '.txt', '.csv'}
DOSSIER_SECTIONS = (
    'identity_and_duplicates', 'coverage_and_languages', 'query_contract',
    'rights_and_cost', 'reader_access', 'quality_and_relevance',
    'operating_limits', 'decision_and_followup',
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, data):
    if path.parent.name == 'sources' and data.get('id') == 'la-referencia':
        # Indexing refreshes source dossiers; preserve the public-ID storage
        # representation used by this provider's query collector.
        from lareferencia_queries import evidence_json
        serialized = evidence_json(data, ensure_ascii=False, indent=2)
    else:
        serialized = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(serialized + '\n')


def input_paths():
    names = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z',
         *CORPUS_ROOTS], cwd=ROOT).decode().split('\0')
    paths = {ROOT / name for name in names if name and '/registry/' not in name and (ROOT / name).is_file()}
    paths.update((REGISTRY / 'analysis/external').glob('*.json'))
    return sorted(paths)


def documents():
    path = REGISTRY / 'analysis/documents.jsonl'
    return read_jsonl(path)


def snapshot(path, root=ROOT):
    body = path.read_bytes()
    name = str(path.relative_to(root))
    sha = digest(body)
    return {'id': digest((name + '\0' + sha).encode()), 'path': name,
            'sha256': sha, 'bytes': len(body), 'format': path.suffix[1:],
            'content': body.decode('utf-8')}


def capture():
    directory = REGISTRY / 'analysis'
    directory.mkdir(exist_ok=True)
    old = documents()
    known = {d['id'] for d in old}
    current, assets = [], []
    captured_at = datetime.now(timezone.utc).isoformat()
    with (directory / 'documents.jsonl').open('a') as stream:
        for path in input_paths():
            if path.suffix in TEXT_SUFFIXES:
                row = snapshot(path)
                current.append({k: v for k, v in row.items() if k != 'content'})
                if row['id'] not in known:
                    stream.write(json.dumps({**row, 'captured_at': captured_at,
                        'evidence_status': 'archived-analysis-not-new-verification'}, ensure_ascii=False) + '\n')
                    known.add(row['id'])
            else:
                assets.append({'path': str(path.relative_to(ROOT)), 'sha256': digest(path.read_bytes()),
                               'bytes': path.stat().st_size, 'storage': 'existing-git-asset'})
    write_json(directory / 'manifest.json', {'schema_version': 1,
        'scope': 'All files under docs/research/free-content (excluding registry) and docs/design/2026-11-free-content, plus registry/analysis/external JSON snapshots; current Git-tracked and nonignored working files.',
        'text_documents': current, 'binary_assets': assets,
        'note': 'Full text is embedded in documents.jsonl; existing binary assets remain in Git and are indexed by path/hash. Snapshots are historical evidence, not fresh provider checks.'})
    print(f'Captured {len(current)} text/evidence files and indexed {len(assets)} binary assets; {len(known)} retained document versions.')


def paragraphs(text):
    """Keep line provenance, including independently named Markdown table rows."""
    lines = text.splitlines()
    start, block, heading = 1, [], ''
    for n, line in enumerate(lines, 1):
        if line.startswith('#'):
            heading = line.lstrip('# ').strip()
        if line.startswith('|') or not line.strip():
            if block:
                yield {'line': start, 'heading': heading, 'text': '\n'.join(block)}
                block = []
            if line.startswith('|'):
                yield {'line': n, 'heading': heading, 'text': line}
        else:
            if not block:
                start = n
            block.append(line)
    if block:
        yield {'line': start, 'heading': heading, 'text': '\n'.join(block)}


def source_mentions(source, current_docs):
    aliases = [source['name'], *source.get('aliases', [])]
    # Boundary matching prevents e.g. HAL matching Shodhganga's unrelated strings.
    patterns = [re.compile(r'(?<!\w)' + re.escape(a) + r'(?!\w)', re.I) for a in aliases if len(a) >= 3]
    matches = []
    for doc in current_docs:
        if doc['format'] != 'md':
            continue
        for block in paragraphs(doc['content']):
            if any(p.search(block['text']) for p in patterns):
                matches.append({'document_id': doc['id'], 'path': doc['path'], **block,
                                'status': 'historical-context-needs-reconciliation'})
    return matches


def index_mentions():
    manifest = json.loads((REGISTRY / 'analysis/manifest.json').read_text())
    ids = {d['id'] for d in manifest['text_documents']}
    current_docs = [d for d in documents() if d['id'] in ids]
    for path in sorted((REGISTRY / 'sources').glob('*.json')):
        source = json.loads(path.read_text())
        source['analysis_refs'] = source_mentions(source, current_docs)
        write_json(path, source)
    print('Indexed source mentions with exact document/line provenance; no claim promoted to current verification.')


def dossier_gaps(source, registry=REGISTRY):
    """A complete label cannot hide unanswered questions or missing evidence files."""
    gaps = []
    for section in DOSSIER_SECTIONS:
        value = source.get('dossier', {}).get(section, {})
        evidence = value.get('evidence') or []
        backed = True
        current = False
        for ref in evidence:
            name = ref.get('path', '') if isinstance(ref, dict) else ref
            path = registry / name
            if not path.is_file():
                path = ROOT / name
            if not path.is_file():
                backed = False
                continue
            # Archived documents are provenance, never fresh provider verification.
            if path.suffix == '.jsonl' and name != 'analysis/documents.jsonl':
                for row in read_jsonl(path):
                    if row.get('observed_at') and (row.get('http') or row.get('robots_evidence')):
                        current = True
                        break
        if (value.get('status') not in ('complete', 'not-applicable')
                or not evidence or not backed or not current or not value.get('summary')
                or value.get('open_questions')):
            gaps.append(section)
    return gaps


def area_completion(area, membership, review, jurisdiction_cells, registry=REGISTRY):
    """Candidate/query counts never satisfy the qualified-origin coverage target."""
    qualified = sorted(set(membership.get('qualified_source_ids', [])))
    target = 100 if area['id'].startswith(('C', 'I')) else None
    evidence = review.get('evidence', [])
    evidence_backed = bool(evidence) and all(
        (registry / (ref.get('path', '') if isinstance(ref, dict) else ref)).is_file()
        for ref in evidence)
    reviewed = (review.get('status') == 'complete' and review.get('reviewed_at')
                and review.get('rationale') and review.get('reviewed_scope')
                and 'unresolved_questions' in review and not review['unresolved_questions']
                and evidence_backed)
    accepted_shortfall = bool(reviewed and review.get('owner_accepted_shortfall') is True
                              and review.get('acceptance_provenance')
                              and review.get('scarcity_evidence_summary'))
    cells = [c for c in jurisdiction_cells if c['area_id'] == area['id']]
    jurisdiction_complete = (target is not None or
                             {c['country'] for c in cells if c['status'] == 'accounted'} == {'USA', 'India'})
    numeric_target_met = target is not None and len(qualified) >= target
    enough_origins = numeric_target_met or accepted_shortfall if target is not None else jurisdiction_complete
    return {'area_id': area['id'], 'name': area['name'], 'qualified_source_ids': qualified,
            'qualified_origins': len(qualified), 'target_origins': target,
            'numeric_target_met': numeric_target_met, 'accepted_shortfall': accepted_shortfall,
            'manual_coverage_review_complete': bool(reviewed),
            'jurisdiction_complete': jurisdiction_complete,
            'status': 'complete' if reviewed and enough_origins and jurisdiction_complete else 'open',
            'review': review or None}


def evidence_run_audit(registry=REGISTRY):
    runs, errors = [], []
    local_failures = read_jsonl(registry / 'analysis/collector-failures.jsonl')
    for directory in sorted((registry / 'runs').glob('*')):
        queue_path, output = directory / 'queue.json', directory / 'observations.jsonl'
        if not queue_path.exists():
            continue
        jobs = json.loads(queue_path.read_text())['jobs']
        rows = read_jsonl(output)
        known = {j['id'] for j in jobs}
        seen = set()
        local_input_failures = []
        for row in rows:
            # A corrected parser may reassess an independently saved capture.
            # Preserve the failed attempt; only accept a duplicate job when its
            # full HTTP/policy proof exactly matches the cited external capture.
            verified_reassessment = False
            reference = row.get('capture_reused_from')
            if row['job_id'] in seen and reference and row.get('reassessment_at'):
                proof_path = (registry / reference).resolve()
                if (proof_path.is_relative_to((registry / 'runs').resolve())
                        and proof_path != output.resolve() and proof_path.is_file()
                        and row.get('outcome') == 'captured'):
                    verified_reassessment = any(
                        prior.get('job_id') == row['job_id']
                        and prior.get('url') == row.get('url')
                        and prior.get('outcome') == 'captured'
                        and prior.get('observed_at') == row.get('observed_at')
                        and prior.get('http') == row.get('http')
                        and prior.get('robots_evidence') == row.get('robots_evidence')
                        for prior in read_jsonl(proof_path))
            if row['job_id'] not in known or row['job_id'] in seen and not verified_reassessment:
                errors.append(f'Unknown/duplicate documentation observation: {directory.name}/{row["job_id"]}')
            seen.add(row['job_id'])
            # A malformed local input can fail before an HTTP request exists.
            # Keep the original observation immutable and require a separately
            # hashed traceback plus an exact hash of that observation. This
            # exception cannot excuse any actual HTTP/policy response.
            candidates = [r for r in local_failures
                          if r.get('run_id') == directory.name and r.get('job_id') == row['job_id']]
            if candidates:
                review = candidates[-1]
                log = (registry / review.get('traceback_path', '')).resolve()
                job = next((j for j in jobs if j['id'] == row['job_id']), {})
                valid = (review.get('kind') == 'invalid-request-url-before-network'
                         and review.get('network_request_sent') is False
                         and review.get('reviewed_at') and row.get('observed_at')
                         and row.get('outcome') == 'blocked-or-failed'
                         and row.get('query_verified') is False
                         and row.get('url') == job.get('url')
                         and isinstance(row.get('url'), str)
                         and not re.match(r'https?://', row['url'])
                         and row.get('http') in (None, {}, {'status': None})
                         and row.get('robots_evidence') in (None, {})
                         and review.get('observation_sha256') == digest(
                             json.dumps(row, ensure_ascii=False, sort_keys=True).encode())
                         and log.is_relative_to(registry.resolve()) and log.is_file()
                         and review.get('traceback_sha256') == digest(log.read_bytes())
                         and b'unknown url type' in log.read_bytes())
                if valid:
                    local_input_failures.append(row['job_id'])
                    continue
                errors.append(f'Invalid local failure evidence: {directory.name}/{row["job_id"]}')
            if not row.get('robots_evidence'):
                errors.append(f'Missing capture hash/policy evidence: {directory.name}/{row["job_id"]}')
            for evidence in [row.get('robots_evidence'), row.get('http')]:
                if evidence is not None and not re.fullmatch(r'[0-9a-f]{64}', evidence.get('sampled_bytes_sha256', '')):
                    errors.append(f'Missing capture hash: {directory.name}/{row["job_id"]}')
            if row.get('outcome') == 'captured' and (row.get('http') or {}).get('status') != 200:
                errors.append(f'Captured document lacks HTTP 200: {directory.name}/{row["job_id"]}')
        runs.append({'run_id': directory.name, 'jobs': len(jobs), 'observations': len(rows),
                     'local_input_failure_job_ids': local_input_failures,
                     'remaining_job_ids': sorted(known - seen),
                     'outcomes': {state: sum(r['outcome'] == state for r in rows)
                                  for state in ('captured', 'skipped', 'blocked-or-failed')},
                     'named_entity_review': 'pending; document capture is not entity extraction or query qualification'})
    return runs, errors


def inventory_capture_audit(registry=REGISTRY):
    """Every retained export needs a matching successful, hashed capture."""
    captures = []
    for path in (registry / 'examples').glob('*.access.jsonl'):
        captures.extend(read_jsonl(path))
    errors = []
    for path in (registry / 'analysis/inventories').glob('*'):
        if not path.is_file() or path.name == 'README.md':
            continue
        name, sha = str(path.relative_to(registry)), digest(path.read_bytes())
        backed = any(row.get('inventory_path') == name and row.get('observed_at')
                     and row.get('http', {}).get('status') == 200
                     and not row.get('http', {}).get('truncated')
                     and row.get('http', {}).get('sampled_bytes_sha256') == sha
                     and re.fullmatch(r'[0-9a-f]{64}', row.get('robots_evidence', {}).get('sampled_bytes_sha256', ''))
                     for row in captures)
        if not backed:
            errors.append('Missing/mismatched inventory capture hash or policy evidence: ' + name)
    return errors


def audit():
    manifest = json.loads((REGISTRY / 'analysis/manifest.json').read_text())
    history = documents()
    by_id = {d['id']: d for d in history}
    errors = []
    if len(by_id) != len(history):
        errors.append('Duplicate archived document IDs')
    expected = {str(p.relative_to(ROOT)) for p in input_paths()}
    recorded = {d['path'] for d in manifest['text_documents'] + manifest['binary_assets']}
    errors.extend('Uncaptured file: ' + p for p in sorted(expected - recorded))
    errors.extend('Stale manifest path: ' + p for p in sorted(recorded - expected))
    for ref in manifest['text_documents']:
        doc = by_id.get(ref['id'])
        if not doc or digest(doc['content'].encode()) != ref['sha256']:
            errors.append('Broken text snapshot: ' + ref['path'])
        if not (ROOT / ref['path']).exists() or digest((ROOT / ref['path']).read_bytes()) != ref['sha256']:
            errors.append('Changed text needs capture: ' + ref['path'])
    for ref in manifest['binary_assets']:
        if not (ROOT / ref['path']).exists() or digest((ROOT / ref['path']).read_bytes()) != ref['sha256']:
            errors.append('Changed/missing asset: ' + ref['path'])
    run_audits, run_errors = evidence_run_audit()
    errors.extend(run_errors)
    errors.extend(inventory_capture_audit())
    source_gaps, memberships, source_mentions_by_doc = {}, {}, {}
    for path in sorted((REGISTRY / 'sources').glob('*.json')):
        source = json.loads(path.read_text())
        gaps = dossier_gaps(source)
        rows = observations(REGISTRY, source['id'])
        passing = current_verified(source, rows)
        if passing < 10:
            gaps.append('ten_current_query_examples')
        for mention in source.get('analysis_refs', []):
            source_mentions_by_doc.setdefault(mention['document_id'], set()).add(source['id'])
            doc = by_id.get(mention['document_id'])
            if not doc or mention['text'] not in doc['content']:
                errors.append('Unbacked source analysis reference: ' + source['id'])
        source_gaps[source['id']] = {'state': source['state'], 'passing_examples': passing,
            'unresolved_fields': gaps, 'complete': not gaps, 'next_action': source['next_action']}
        for area in source['areas']:
            memberships.setdefault(area, {'candidate_source_ids': [], 'query_example_source_ids': [], 'qualified_source_ids': []})
            memberships[area]['candidate_source_ids'].append(source['id'])
            area_passing = area_verified(source, rows, area)
            if passing >= 10 and area_passing:
                memberships[area]['query_example_source_ids'].append(source['id'])
            if source.get('full_qualification_complete') and not gaps and area_passing:
                memberships[area]['qualified_source_ids'].append(source['id'])
    areas = json.loads((REGISTRY / 'areas.json').read_text())['areas']
    for area in areas:
        memberships.setdefault(area['id'], {'candidate_source_ids': [], 'query_example_source_ids': [], 'qualified_source_ids': []})
    leads = json.loads((REGISTRY / 'discovery-links.json').read_text())['leads']
    unresolved = [l['id'] for l in leads if l['state'] == 'untriaged']
    discovery_followups = [{key: lead.get(key) for key in ('id', 'url', 'kind', 'next_action')}
                           for lead in leads if lead.get('followup_state') == 'open']
    unmapped = [{'lead_id': l['id'], 'url': l['url'], 'suggested_entity_id': l.get('suggested_entity_id')}
                for l in leads if l.get('kind') == 'catalog' and not l.get('source_id')]
    missing_sources = [l['id'] for l in leads if l.get('source_id') and l['source_id'] not in source_gaps]
    errors.extend('Lead maps to missing source: ' + sid for sid in missing_sources)
    # Alias indexing is deliberately not treated as an exhaustive named-entity audit.
    review_file = REGISTRY / 'analysis/named-entity-reviews.jsonl'
    entity_reviews = {}
    if review_file.exists():
        for review in read_jsonl(review_file):
            entity_reviews[review['document_id']] = review
    def entity_status(document_id):
        review = entity_reviews.get(document_id, {})
        return ('complete' if review.get('status') == 'complete' and review.get('rationale')
                and review.get('reviewed_at') and not review.get('unresolved_names')
                else 'pending-manual-completeness-review')
    captured_docs = [{**d, 'mapped_source_ids': sorted(source_mentions_by_doc.get(d['id'], [])),
                      'named_entity_review_status': entity_status(d['id'])}
                     for d in manifest['text_documents']]
    # Older snapshots are retained and must be reviewed too, even when superseded.
    pending_entity_documents = [d['id'] for d in history if entity_status(d['id']) != 'complete']
    pending_primary_documents = []
    for output in sorted((REGISTRY / 'runs').glob('*/observations.jsonl')):
        for row in read_jsonl(output):
            identity = 'primary:' + digest(json.dumps(row, ensure_ascii=False, sort_keys=True).encode())
            if entity_status(identity) != 'complete':
                pending_primary_documents.append({'document_id': identity, 'path': str(output.relative_to(REGISTRY)), 'job_id': row['job_id']})
    named_complete = not pending_entity_documents and not pending_primary_documents
    jurisdiction_file = REGISTRY / 'analysis/jurisdiction-reviews.jsonl'
    jurisdiction_reviews = {}
    if jurisdiction_file.exists():
        for row in read_jsonl(jurisdiction_file):
            jurisdiction_reviews[(row['area_id'], row['country'])] = row
    jurisdiction_cells = []
    for area in areas:
        if not area['id'].startswith('P'):
            continue
        for country in ('USA', 'India'):
            review = jurisdiction_reviews.get((area['id'], country), {})
            qualified = [sid for sid in review.get('qualified_source_ids', [])
                         if sid in memberships[area['id']]['qualified_source_ids']]
            accounted = (bool(review.get('evidence')) and bool(review.get('rationale'))
                         and (bool(qualified) or review.get('owner_accepted_shortfall') is True))
            jurisdiction_cells.append({'area_id': area['id'], 'country': country,
                                       'status': 'accounted' if accounted else 'open',
                                       'qualified_source_ids': qualified,
                                       'review': review or None})
    area_reviews = {}
    area_review_file = REGISTRY / 'analysis/area-coverage-reviews.jsonl'
    if area_review_file.exists():
        for review in read_jsonl(area_review_file):
            area_reviews[review['area_id']] = review
    area_results = {area['id']: area_completion(area, memberships[area['id']],
                    area_reviews.get(area['id'], {}), jurisdiction_cells) for area in areas}
    entity_leads_file = REGISTRY / 'analysis/entity-leads.jsonl'
    entity_leads = {}
    if entity_leads_file.exists():
        for row in read_jsonl(entity_leads_file):
            entity_leads[row['id']] = row
    unresolved_names = [{k: row.get(k) for k in ('id', 'observed_name', 'role', 'status', 'next_action')}
                        for row in entity_leads.values() if not row.get('source_id')]
    coverage = {'schema_version': 1, 'captured_documents': captured_docs,
                'unresolved_entity_mappings': unmapped, 'documentation_runs': run_audits,
                'named_entity_lead_count': len(entity_leads), 'unresolved_named_entities': unresolved_names,
                'named_entity_review_complete': named_complete,
                'pending_named_entity_document_ids': pending_entity_documents,
                'pending_primary_document_entity_reviews': pending_primary_documents,
                'named_entity_review_note': 'Every document is archived, but alias matching and linked-URL classification do not prove all unlinked names or newly observed publisher links have been resolved. Review current and historical text plus primary-document excerpts explicitly.',
                'missing_analysis_fields': {sid: gap['unresolved_fields'] for sid, gap in source_gaps.items()},
                'jurisdiction_cells': jurisdiction_cells}
    write_json(REGISTRY / 'coverage-audit.json', coverage)
    result = {'schema_version': 1, 'capture_errors': errors, 'captured_text_documents': len(manifest['text_documents']),
        'indexed_binary_assets': len(manifest['binary_assets']), 'document_capture_complete': not errors,
        'source_records': len(source_gaps), 'source_dossiers_complete': sum(v['complete'] for v in source_gaps.values()),
        'query_verified_sources': sum(v['passing_examples'] >= 10 for v in source_gaps.values()),
        'verified_examples': sum(v['passing_examples'] for v in source_gaps.values()),
        'untriaged_link_ids': unresolved, 'unresolved_entity_mappings': unmapped,
        'open_discovery_followups': discovery_followups,
        'named_entity_lead_count': len(entity_leads), 'unresolved_named_entity_count': len(unresolved_names),
        'named_entity_review_complete': named_complete, 'documentation_runs': run_audits,
        'source_gaps': source_gaps, 'area_coverage': memberships,
        'area_completion': area_results,
        'target_progress': {'area_total': len(areas),
                            'areas_complete': sum(v['status'] == 'complete' for v in area_results.values()),
                            'jurisdiction_total': len(jurisdiction_cells),
                            'jurisdictions_accounted': sum(c['status'] == 'accounted' for c in jurisdiction_cells),
                            'origins_per_content_or_industry_area': 100,
                            'target_percentage': 100,
                            'note': 'Area memberships overlap; counts cannot be summed into unique origins or overall percentage completion.'},
        'goal_complete': not errors and not unresolved and all(v['complete'] for v in source_gaps.values()) and all(v['status'] == 'complete' for v in area_results.values()),
        'completion_note': 'Even a full current inventory does not automatically satisfy 100-origin targets or USA/India jurisdiction coverage. Owner acceptance or target evidence is required separately.'}
    # Never automatically close a goal whose expansion/coverage targets remain open.
    goal = json.loads((REGISTRY / 'goal.json').read_text())
    result['goal_complete'] = (result['goal_complete'] and not unmapped and not discovery_followups
                               and coverage['named_entity_review_complete']
                               and all(c['status'] == 'accounted' for c in jurisdiction_cells)
                               and all(m['state'] == 'complete' for m in goal['milestones']))
    write_json(REGISTRY / 'completion-audit.json', result)
    print(json.dumps({k: v for k, v in result.items() if k not in ('source_gaps', 'area_coverage', 'untriaged_link_ids')}, indent=2))
    print(f'Untriaged links: {len(unresolved)}; unresolved source dossiers: {sum(not v["complete"] for v in source_gaps.values())}')
    if errors:
        raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['capture', 'index', 'audit'])
    command = parser.parse_args().command
    {'capture': capture, 'index': index_mentions, 'audit': audit}[command]()


if __name__ == '__main__':
    main()
