import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import siyavula_inventory as si


def document():
    return (f'<html lang="en"><h1>Mathematics Grade 10</h1>'
            f'<a class="chapter-title" href="{si.ENDPOINT}/trigonometry-part-1">Chapter 5: Trigonometry</a>'
            f'<a class="chapter-title" href="{si.ENDPOINT}/trigonometry-part-2">Chapter 11: Trigonometry</a>'
            f'<a href="{si.LICENSE}">Creative Commons Attribution License</a></html>').encode()


class SchoolTocTests(unittest.TestCase):
    def test_equal_chapter_names_keep_native_parts_and_unknown_edition(self):
        rows = si.parse_inventory(document())
        self.assertEqual(len({r['id'] for r in rows}), 2)
        self.assertEqual([r['chapter_number'] for r in rows], [5, 11])
        self.assertTrue(all(r['edition_year'] is None and not r['reading_access_verified'] for r in rows))

    def test_wrong_book_language_or_license_is_not_imported(self):
        for old, new in [(b'Grade 10', b'Grade 11'), (b'lang="en"', b'lang="af"'),
                         (si.LICENSE.encode(), b'https://example.org/no-license')]:
            with self.subTest(old=old), self.assertRaises(ValueError):
                si.parse_inventory(document().replace(old, new))

    def test_duplicate_and_foreign_links_are_rejected(self):
        for body in [document().replace(b'trigonometry-part-2', b'trigonometry-part-1'),
                     document().replace(b'Chapter 11:', b'Chapter 5:'),
                     document().replace(si.ENDPOINT.encode(), b'https://other.example/book')]:
            with self.assertRaises(ValueError):
                si.parse_inventory(body)

    def test_title_lookup_retains_ambiguity_and_does_not_claim_full_text(self):
        rows = si.parse_inventory(document())
        self.assertEqual(len(si.local_search(rows, {'mode': 'title_tokens', 'text': 'TRIGONOMETRY'})), 2)
        self.assertEqual(si.local_search(rows, {'mode': 'title_tokens', 'text': ''}), [])
        self.assertEqual(si.local_search(rows, {'mode': 'title_tokens', 'text': 'calculus'}), [])
        self.assertEqual(len(si.local_search(rows, {'mode': 'native_id', 'text': rows[0]['id']})), 1)
        with self.assertRaises(ValueError):
            si.local_search(rows, {'mode': 'full_text', 'text': 'angles'})

    def test_capture_hash_or_pin_failure_cannot_verify_local_examples(self):
        body = document()
        digest = hashlib.sha256(body).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'examples').mkdir()
            source = {'id': 'siyavula', 'query': {'adapter': 'siyavula-toc', 'expected_inventory_sha256': digest,
                'expected_entry_count': 2, 'cases': [{'id': 'trig', 'intent': 'Chapter title lookup',
                'expected_ids': [si.ENDPOINT + '/trigonometry-part-1'], 'request': {'method': 'GET', 'url': si.ENDPOINT,
                'local_query': {'mode': 'title_tokens', 'text': 'trigonometry'}}}]}}
            capture = {'http': {'status': 200, 'truncated': False, 'sampled_bytes_sha256': digest},
                       'request': {'url': si.ENDPOINT}, 'robots_evidence': {}}
            with mock.patch.object(si, 'REGISTRY', root):
                si.record_examples(source, capture, body)
                capture['http']['sampled_bytes_sha256'] = 'f' * 64
                si.record_examples(source, capture, body)
                capture['http']['sampled_bytes_sha256'] = digest
                source['query']['expected_entry_count'] = 3
                si.record_examples(source, capture, body)
            results = [json.loads(line) for line in (root / 'examples/siyavula.jsonl').read_text().splitlines()]
            self.assertEqual([r['verdict'] for r in results], ['verified', 'unverified', 'unverified'])
