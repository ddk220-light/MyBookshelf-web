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
    source_gaps, memberships = {}, {}
    for path in sorted((REGISTRY / 'sources').glob('*.json')):
        source = json.loads(path.read_text())
        gaps = []
        for section in DOSSIER_SECTIONS:
            value = source.get('dossier', {}).get(section, {})
            # Complete/not-applicable must carry justification and evidence.
            if value.get('status') not in ('complete', 'not-applicable') or not value.get('evidence') or not value.get('summary'):
                gaps.append(section)
        passing = current_verified(source, observations(REGISTRY, source['id']))
        if passing < 10:
            gaps.append('ten_current_query_examples')
        for mention in source.get('analysis_refs', []):
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
            if source.get('full_qualification_complete'):
                memberships[area]['qualified_source_ids'].append(source['id'])
    areas = json.loads((REGISTRY / 'areas.json').read_text())['areas']
    for area in areas:
        memberships.setdefault(area['id'], {'candidate_source_ids': [], 'query_example_source_ids': [], 'qualified_source_ids': []})
    leads = json.loads((REGISTRY / 'discovery-links.json').read_text())['leads']
    unresolved = [l['id'] for l in leads if l['state'] == 'untriaged']
    result = {'schema_version': 1, 'capture_errors': errors, 'captured_text_documents': len(manifest['text_documents']),
        'indexed_binary_assets': len(manifest['binary_assets']), 'document_capture_complete': not errors,
        'source_records': len(source_gaps), 'source_dossiers_complete': sum(v['complete'] for v in source_gaps.values()),
        'query_verified_sources': sum(v['passing_examples'] >= 10 for v in source_gaps.values()),
        'verified_examples': sum(v['passing_examples'] for v in source_gaps.values()),
        'untriaged_link_ids': unresolved, 'source_gaps': source_gaps, 'area_coverage': memberships,
        'goal_complete': not errors and not unresolved and all(v['complete'] for v in source_gaps.values()) and all(v['qualified_source_ids'] for v in memberships.values()),
        'completion_note': 'Even a full current inventory does not automatically satisfy 100-origin targets or USA/India jurisdiction coverage. Owner acceptance or target evidence is required separately.'}
    # Never automatically close a goal whose expansion/coverage targets remain open.
    goal = json.loads((REGISTRY / 'goal.json').read_text())
    result['goal_complete'] = result['goal_complete'] and all(m['state'] == 'complete' for m in goal['milestones'])
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
