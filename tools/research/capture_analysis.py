#!/usr/bin/env python3
"""Capture existing research losslessly and report completion gaps, offline."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess

from source_registry import ROOT, REGISTRY, current_verified, observations

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
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def input_paths():
    names = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z',
         *CORPUS_ROOTS], cwd=ROOT).decode().split('\0')
    paths = {ROOT / name for name in names if name and '/registry/' not in name and (ROOT / name).is_file()}
    paths.update((REGISTRY / 'analysis/external').glob('*.json'))
    return sorted(paths)


def documents():
    path = REGISTRY / 'analysis/documents.jsonl'
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


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
                for line in path.read_text().splitlines():
                    row = json.loads(line)
                    if row.get('observed_at') and (row.get('http') or row.get('robots_evidence')):
                        current = True
                        break
        if (value.get('status') not in ('complete', 'not-applicable')
                or not evidence or not backed or not current or not value.get('summary')
                or value.get('open_questions')):
            gaps.append(section)
    return gaps


def evidence_run_audit(registry=REGISTRY):
    runs, errors = [], []
    for directory in sorted((registry / 'runs').glob('*')):
        queue_path, output = directory / 'queue.json', directory / 'observations.jsonl'
        if not queue_path.exists():
            continue
        jobs = json.loads(queue_path.read_text())['jobs']
        rows = [json.loads(line) for line in output.read_text().splitlines()] if output.exists() else []
        known = {j['id'] for j in jobs}
        seen = set()
        for row in rows:
            if row['job_id'] not in known or row['job_id'] in seen:
                errors.append(f'Unknown/duplicate documentation observation: {directory.name}/{row["job_id"]}')
            seen.add(row['job_id'])
            for evidence in [row.get('robots_evidence'), row.get('http')]:
                if evidence is not None and not re.fullmatch(r'[0-9a-f]{64}', evidence.get('sampled_bytes_sha256', '')):
                    errors.append(f'Missing capture hash: {directory.name}/{row["job_id"]}')
            if row.get('outcome') == 'captured' and (row.get('http') or {}).get('status') != 200:
                errors.append(f'Captured document lacks HTTP 200: {directory.name}/{row["job_id"]}')
        runs.append({'run_id': directory.name, 'jobs': len(jobs), 'observations': len(rows),
                     'remaining_job_ids': sorted(known - seen),
                     'outcomes': {state: sum(r['outcome'] == state for r in rows)
                                  for state in ('captured', 'skipped', 'blocked-or-failed')},
                     'named_entity_review': 'pending; document capture is not entity extraction or query qualification'})
    return runs, errors


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
    source_gaps, memberships, source_mentions_by_doc = {}, {}, {}
    for path in sorted((REGISTRY / 'sources').glob('*.json')):
        source = json.loads(path.read_text())
        gaps = dossier_gaps(source)
        passing = current_verified(source, observations(REGISTRY, source['id']))
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
            if passing >= 10:
                memberships[area]['query_example_source_ids'].append(source['id'])
            if source.get('full_qualification_complete') and not gaps:
                memberships[area]['qualified_source_ids'].append(source['id'])
    areas = json.loads((REGISTRY / 'areas.json').read_text())['areas']
    for area in areas:
        memberships.setdefault(area['id'], {'candidate_source_ids': [], 'query_example_source_ids': [], 'qualified_source_ids': []})
    leads = json.loads((REGISTRY / 'discovery-links.json').read_text())['leads']
    unresolved = [l['id'] for l in leads if l['state'] == 'untriaged']
    unmapped = [{'lead_id': l['id'], 'url': l['url'], 'suggested_entity_id': l.get('suggested_entity_id')}
                for l in leads if l.get('kind') == 'catalog' and not l.get('source_id')]
    missing_sources = [l['id'] for l in leads if l.get('source_id') and l['source_id'] not in source_gaps]
    errors.extend('Lead maps to missing source: ' + sid for sid in missing_sources)
    # Alias indexing is deliberately not treated as an exhaustive named-entity audit.
    review_file = REGISTRY / 'analysis/named-entity-reviews.jsonl'
    entity_reviews = {}
    if review_file.exists():
        for line in review_file.read_text().splitlines():
            review = json.loads(line)
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
        for line in output.read_text().splitlines():
            row = json.loads(line)
            identity = 'primary:' + digest(json.dumps(row, ensure_ascii=False, sort_keys=True).encode())
            if entity_status(identity) != 'complete':
                pending_primary_documents.append({'document_id': identity, 'path': str(output.relative_to(REGISTRY)), 'job_id': row['job_id']})
    named_complete = not pending_entity_documents and not pending_primary_documents
    jurisdiction_file = REGISTRY / 'analysis/jurisdiction-reviews.jsonl'
    jurisdiction_reviews = {}
    if jurisdiction_file.exists():
        for line in jurisdiction_file.read_text().splitlines():
            row = json.loads(line)
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
    coverage = {'schema_version': 1, 'captured_documents': captured_docs,
                'unresolved_entity_mappings': unmapped, 'documentation_runs': run_audits,
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
        'named_entity_review_complete': named_complete, 'documentation_runs': run_audits,
        'source_gaps': source_gaps, 'area_coverage': memberships,
        'goal_complete': not errors and not unresolved and all(v['complete'] for v in source_gaps.values()) and all(v['qualified_source_ids'] for v in memberships.values()),
        'completion_note': 'Even a full current inventory does not automatically satisfy 100-origin targets or USA/India jurisdiction coverage. Owner acceptance or target evidence is required separately.'}
    # Never automatically close a goal whose expansion/coverage targets remain open.
    goal = json.loads((REGISTRY / 'goal.json').read_text())
    result['goal_complete'] = (result['goal_complete'] and not unmapped
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
