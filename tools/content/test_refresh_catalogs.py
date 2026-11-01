import json
from pathlib import Path
import tempfile
import unittest
from refresh_catalogs import prepare, SOURCES


class RefreshTests(unittest.TestCase):
    def baseline(self, path):
        path.mkdir()
        for source in SOURCES:
            (path / (source + '.json')).write_text(json.dumps({'schemaVersion': 1, 'sourceId': source, 'recordCount': 1,
                'records': [{'key': source + ':1', 'title': 'Synthetic refresh fixture', 'evidence': {'observedAt': 'old'}}],
                'importedAt': 'old', 'complete': False, 'revision': 'old'}))

    def importer(self, source, target, prior):
        data = json.loads(target.read_text())
        data['records'][0]['evidence']['observedAt'] = 'new'
        data.update(importedAt='new', revision='new')
        target.write_text(json.dumps(data))

    def test_candidates_preserve_baseline_and_distinguish_observation_refresh_from_metadata_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); baseline = root / 'active'; self.baseline(baseline)
            original = {p.name: p.read_bytes() for p in baseline.iterdir()}
            result = prepare(baseline, root / 'candidate', self.importer)
            self.assertEqual(len(result['sources']), 2)
            self.assertEqual([r['metadataChanged'] for r in result['sources']], [0, 0])
            self.assertTrue((root / 'candidate' / 'report.md').exists())
            self.assertEqual({p.name: p.read_bytes() for p in baseline.iterdir()}, original)
            with self.assertRaises(ValueError): prepare(baseline, root / 'candidate', self.importer)

    def test_second_source_failure_or_empty_refresh_never_publishes_partial_candidates(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); baseline = root / 'active'; self.baseline(baseline)
            original = {p.name: p.read_bytes() for p in baseline.iterdir()}
            def fail(source, target, prior):
                self.importer(source, target, prior)
                if source == 'open-textbook-library': raise ValueError('Source unavailable')
            with self.assertRaises(ValueError): prepare(baseline, root / 'failed', fail)
            self.assertFalse((root / 'failed').exists())
            self.assertEqual({p.name: p.read_bytes() for p in baseline.iterdir()}, original)
            def empty(source, target, prior): target.write_text(json.dumps({**prior, 'records': [], 'recordCount': 0}))
            with self.assertRaises(ValueError): prepare(baseline, root / 'empty', empty)
            self.assertFalse((root / 'empty').exists())
            with self.assertRaises(ValueError): prepare(baseline, baseline / 'nested', self.importer)


if __name__ == '__main__': unittest.main()
