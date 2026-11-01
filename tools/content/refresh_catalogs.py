#!/usr/bin/env python3
"""Prepare reviewed metadata candidates; never mutate the active baseline."""
import argparse
import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

SOURCES = {'gutenberg': 'import_gutenberg.py', 'open-textbook-library': 'import_textbooks.py', 'bookdash': 'import_bookdash.py'}


def semantic(value):
    if isinstance(value, dict): return {k: semantic(v) for k, v in value.items() if k not in ('observedAt', 'retrievedAt')}
    if isinstance(value, list): return [semantic(v) for v in value]
    return value


def compare(before, after):
    old = {r['key']: r for r in before['records']}
    new = {r['key']: r for r in after['records']}
    return {'sourceId': after['sourceId'], 'before': len(old), 'after': len(new),
            'added': sorted(new.keys() - old.keys()), 'missingFromCandidate': sorted(old.keys() - new.keys()),
            'metadataChanged': sum(semantic(old[k]) != semantic(new[k]) for k in old.keys() & new.keys()),
            'importedAt': after['importedAt'], 'complete': after['complete'], 'revision': after['revision']}


def import_source(source, target, prior):
    script = Path(__file__).resolve().parent / SOURCES[source]
    command = [sys.executable, str(script), '--output', str(target)]
    if source in ('gutenberg', 'bookdash'): command += ['--max-records', str(prior['recordCount'])]
    subprocess.run(command, check=True, timeout=240 if source == 'bookdash' else 120, stdout=subprocess.DEVNULL)


def prepare(baseline, output, importer=import_source):
    baseline, output = Path(baseline).resolve(), Path(output).resolve()
    if output.exists(): raise ValueError('Use a new candidate directory; never overwrite a reviewed candidate')
    if output == baseline or baseline in output.parents: raise ValueError('Candidate directory must be outside the active catalog directory')
    output.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    with tempfile.TemporaryDirectory(dir=output.parent, prefix='.free-content-candidate-') as temporary:
        staged = Path(temporary)
        for source in SOURCES:
            name = source + '.json'
            prior = json.loads((baseline / name).read_text())
            shutil.copy2(baseline / name, staged / name)
            importer(source, staged / name, prior)
            after = json.loads((staged / name).read_text())
            if after.get('schemaVersion') != 1 or after.get('sourceId') != source or not after.get('records'):
                raise ValueError('Invalid or empty refresh candidate')
            if after['recordCount'] != len(after['records']) or len({r['key'] for r in after['records']}) != after['recordCount']:
                raise ValueError('Candidate identity/count mismatch')
            if after['recordCount'] < prior['recordCount'] * .8: raise ValueError('Catalog shrink requires review')
            rows.append(compare(prior, after))
        report = {'preparedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sources': rows,
                  'note': 'Candidate metadata only. Missing keys are absent from this export/subset, not proven deleted from the source. Review before merge; never automatically enable production.'}
        (staged / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
        lines = ['Refresh metadata and access observations from official Gutenberg, Open Textbook Library and Book Dash sources.', '',
                 '| Source | Before | After | Added | Missing from candidate | Metadata changes |', '| --- | --- | --- | --- | --- | --- |']
        for row in rows:
            lines.append(f'| {row["sourceId"]} | {row["before"]} | {row["after"]} | {len(row["added"])} | {len(row["missingFromCandidate"])} | {row["metadataChanged"]} |')
        lines += ['', report['note'], '', 'No book text, artwork, reviews or descriptions are included. Catalog metadata and each source’s content rights are recorded separately.',
                  'Validation: bounded importers, snapshot API audit and importer tests. The refresh workflow explicitly dispatches full application CI for this draft PR.']
        (staged / 'report.md').write_text('\n'.join(lines) + '\n')
        os.replace(staged, output)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-dir', default='server/data/content')
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    result = prepare(args.baseline_dir, args.output_dir)
    print(json.dumps(result))


if __name__ == '__main__': main()
