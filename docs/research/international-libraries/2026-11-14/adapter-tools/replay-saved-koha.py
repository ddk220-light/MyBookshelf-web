"""Replay saved Koha HTML through unchanged app parsers. No network calls."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'adapter-tools' / 'replays'
OUT.mkdir(exist_ok=True)
NODE = os.environ.get('MYBOOKSHELF_REPLAY_NODE', '/workspace/mybookshelf-cloud/node-v22.23.4-linux-x64/bin/node')
audit = json.loads((ROOT / 'adapter-tools' / 'robots-audit.json').read_text())
summary = []
redirects = []

def replay(mode, snapshot, source):
    proc = subprocess.run([NODE, str(ROOT / 'adapter-tools' / 'replay-koha.mjs'), mode, str(snapshot), source],
                          capture_output=True, text=True, env=os.environ)
    if proc.returncode:
        raise RuntimeError(proc.stderr[:1000])
    return json.loads(proc.stdout)

for country, country_audit in audit['countries'].items():
    for row in country_audit['checks']:
        if 'opac-search.pl' not in row['url'] or row['capturedStatus'] != 200:
            continue
        source_file = Path(row['sourceFile'])
        captured = json.loads(source_file.read_text())
        for key in row['metadataKey'].split('.') if row['metadataKey'] else []:
            captured = captured[int(key)] if isinstance(captured, list) else captured[key]
        hints = [captured.get('evidence'), captured.get('evidence_file')]
        choices = [ROOT / country / hint for hint in hints if hint]
        choices.extend([source_file.with_suffix('.html'), source_file.parent / 'search.html'])
        snapshot = next((p for p in choices if p.exists()), None)
        if snapshot is None:
            continue
        digest = hashlib.sha256(row['url'].encode()).hexdigest()[:8]
        result = replay('search', snapshot, row['url'])
        result['capturedResponseSource'] = str(source_file)
        result['savedRobotsClassification'] = row['classification']
        path = OUT / f'{country}-{snapshot.stem}-{digest}.json'
        path.write_text(json.dumps(result, indent=2))
        expanded = result['expandedCatalogSearch']
        detailed = result['detailedTitleSearch']
        expanded_count = len(expanded.get('value') or [])
        detailed_count = len((detailed.get('value') or {}).get('records', []))
        final = captured.get('final_url', captured.get('url', ''))
        parts = urlsplit(final)
        record_id = parse_qs(parts.query).get('biblionumber', [None])[0]
        record_recognized = False
        if record_id and 'opac-detail.pl' in parts.path:
            record = replay('record', snapshot, record_id)
            record['capturedResponseSource'] = str(source_file)
            record['captureFinalUrl'] = final
            record_path = OUT / f'{country}-redirect-record-{record_id}-{digest}.json'
            record_path.write_text(json.dumps(record, indent=2))
            record_recognized = record['catalogRecord']['recognized']
            redirects.append({'country': country, 'originalQuery': row['url'], 'finalUrl': final,
                              'recordId': record_id, 'recognized': record_recognized, 'output': str(record_path)})
        summary.append({'country': country, 'url': row['url'], 'catalogOrigin': f'{urlsplit(row["url"]).scheme}://{urlsplit(row["url"]).netloc}',
                        'snapshot': str(snapshot), 'expandedRecognized': expanded['recognized'], 'expandedRecords': expanded_count,
                        'detailedRecognized': detailed['recognized'], 'detailedRecords': detailed_count,
                        'redirectRecordRecognized': record_recognized,
                        'positiveParserEvidence': bool(expanded_count or detailed_count or record_recognized),
                        'savedRobotsAllowed': row['allowed'], 'savedRobotsClassification': row['classification'], 'output': str(path)})

(ROOT / 'adapter-tools' / 'koha-replay-summary.json').write_text(json.dumps(summary, indent=2))
(ROOT / 'adapter-tools' / 'koha-redirect-record-summary.json').write_text(json.dumps(redirects, indent=2))
for country in audit['countries']:
    rows = [r for r in summary if r['country'] == country]
    positive = {r['catalogOrigin'] for r in rows if r['positiveParserEvidence']}
    allowed_positive = {r['catalogOrigin'] for r in rows if r['positiveParserEvidence'] and r['savedRobotsAllowed'] is True}
    print(country, 'captured queries', len(rows), 'positive catalog origins', len(positive), 'allowed positive catalog origins', len(allowed_positive))
