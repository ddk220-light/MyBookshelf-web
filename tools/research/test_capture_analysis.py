import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
import zlib
import json

from capture_analysis import paragraphs, snapshot, source_mentions
from sphinx_inventory import local_search, parse_inventory, probe


class CorpusTests(unittest.TestCase):
    def test_snapshot_is_lossless_and_changes_identity_when_evidence_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'review.md'
            path.write_text('पानी — திருக்குறள்\nfailed query\n')
            first = snapshot(path, Path(tmp))
            self.assertEqual(first['content'], path.read_text())
            path.write_text(path.read_text() + 'later success\n')
            second = snapshot(path, Path(tmp))
            self.assertNotEqual(first['id'], second['id'])
            self.assertIn('failed query', second['content'])

    def test_named_catalog_table_rows_keep_separate_line_provenance(self):
        content = '# Sources\n\n| HAL | failed |\n| Shodhganga | pending |\n'
        rows = list(paragraphs(content))
        self.assertEqual([r['line'] for r in rows if r['text'].startswith('|')], [3, 4])
        mentions = source_mentions({'name': 'HAL'}, [{'id': 'test', 'path': 'sources.md', 'format': 'md', 'content': content}])
        self.assertEqual(len(mentions), 1)
        self.assertEqual(mentions[0]['line'], 3)


class InventoryTests(unittest.TestCase):
    def inventory(self, line):
        return b'# Sphinx inventory version 2\n# Project: Python\n# Version: 3.15\n# zlib\n' + zlib.compress(line.encode())

    def test_real_inventory_anchor_substitution_and_exact_symbol_search(self):
        rows = parse_inventory(self.inventory('pathlib.Path py:class 1 library/pathlib.html#$ -\n'), 'https://docs.python.org/3.15/', '3.15')
        self.assertEqual(rows[0]['landing_page'], 'https://docs.python.org/3.15/library/pathlib.html#pathlib.Path')
        self.assertEqual(local_search(rows, {'mode': 'exact_symbol', 'text': 'pathlib.Path'}), rows)
        self.assertEqual(local_search(rows, {'mode': 'exact_symbol', 'text': 'Path'}), [])

    def test_wrong_version_and_external_locations_fail(self):
        with self.assertRaises(ValueError):
            parse_inventory(self.inventory('x py:class 1 x.html -\n'), 'https://docs.python.org/3.15/', '3.14')
        with self.assertRaises(ValueError):
            parse_inventory(self.inventory('x py:class 1 https://other.example/x -\n'), 'https://docs.python.org/3.15/', '3.15')

    def test_failed_import_is_retained_and_cannot_leave_a_fresh_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            (directory / 'examples').mkdir()
            request = {'method': 'GET', 'url': 'https://docs.python.org/3.15/objects.inv', 'local_query': {'mode': 'exact_symbol', 'text': 'x'}}
            source = {'id': 'fixture', 'query': {'adapter': 'sphinx-inventory', 'endpoint': request['url'], 'version': '3.15', 'base_url': 'https://docs.python.org/3.15/', 'cases': [{'id': 'x', 'request': request, 'expected_ids': ['py:class:x']}]}}
            with patch('sphinx_inventory.REGISTRY', directory), patch('sphinx_inventory.urllib.request.urlopen', side_effect=TimeoutError('Timed out')):
                probe(source)
            row = json.loads((directory / 'examples/fixture.jsonl').read_text())
            self.assertEqual(row['verdict'], 'unverified')
            self.assertEqual(row['execution_mode'], 'metadata-import-failed')
            self.assertEqual(row['error'], 'Timed out')


if __name__ == '__main__':
    unittest.main()
