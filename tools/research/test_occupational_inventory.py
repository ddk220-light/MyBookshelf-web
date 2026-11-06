import json
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from occupational_inventory import ENDPOINT, local_search, parse_onet, probe, record_examples


class OccupationContracts(unittest.TestCase):
    def export(self, rows, version='31.0'):
        return json.dumps({'table_id': 'occupation_data',
                           'data_dictionary': f'https://www.onetcenter.org/dictionary/{version}/json/occupation_data.html',
                           'row': rows}).encode()

    def row(self, code='29-1141.00', title='Registered Nurses'):
        return {'onetsoc_code': code, 'title': title, 'description': 'Provide nursing care.'}

    def test_specialties_remain_distinct_and_version_is_pinned(self):
        rows = parse_onet(self.export([self.row(), self.row('29-1141.01', 'Acute Care Nurses')]))
        self.assertEqual([r['id'] for r in local_search(rows, {'mode': 'exact_code', 'text': '29-1141.00'})], ['29-1141.00'])
        self.assertEqual(len(local_search(rows, {'mode': 'title_contains', 'text': 'nurses'})), 2)
        with self.assertRaises(ValueError):
            parse_onet(self.export([self.row()], version='31.1'))

    def test_reject_duplicate_or_malformed_ids_and_error_payloads(self):
        for body in [self.export([self.row(), self.row()]), self.export([self.row('291141')]), b'{"error":"login required"}']:
            with self.assertRaises(ValueError):
                parse_onet(body)

    def test_empty_and_unsupported_modes_do_not_return_catalog(self):
        rows = parse_onet(self.export([self.row()]))
        self.assertEqual(local_search(rows, {'mode': 'title_contains', 'text': '  '}), [])
        self.assertEqual(local_search(rows, {'mode': 'title_contains', 'text': 'nonexistent occupation xyz'}), [])
        with self.assertRaises(ValueError):
            local_search(rows, {'mode': 'job_vacancy', 'text': 'nurse'})

    def test_description_search_does_not_change_title_only_semantics(self):
        rows = parse_onet(self.export([self.row()]))
        self.assertEqual(local_search(rows, {'mode': 'title_contains', 'text': 'nursing'}), [])
        self.assertEqual(len(local_search(rows, {'mode': 'title_or_description', 'text': 'nursing'})), 1)

    def test_historical_release_is_explicit_and_not_silently_current(self):
        body = self.export([self.row()], version='30.3')
        self.assertEqual(parse_onet(body, '30.3')[0]['catalog_version'], '30.3')
        with self.assertRaises(ValueError):
            parse_onet(body)

    def test_word_matching_does_not_confuse_nurses_and_nurseries(self):
        rows = parse_onet(self.export([self.row(), self.row('45-2092.00', 'Nursery Workers')]))
        # Preserve the earlier substring route as historical behavior, but do not
        # use its nursery hit as evidence of nursing relevance.
        self.assertEqual(len(local_search(rows, {'mode': 'title_contains', 'text': 'nurse'})), 2)
        self.assertEqual([x['id'] for x in local_search(rows, {'mode': 'title_tokens', 'text': 'registered nurse'})], ['29-1141.00'])
        self.assertEqual(local_search(rows, {'mode': 'title_tokens', 'text': '...' }), [])
        self.assertEqual(local_search(rows, {'mode': 'title_tokens', 'text': 'registered engineer'}), [])

    def test_changed_pinned_export_cannot_create_verified_examples(self):
        previous = self.export([self.row()])
        changed = self.export([self.row(title='Changed occupation name')])
        case = {'id': 'nurses', 'expected_ids': ['29-1141.00'], 'request': {
            'method': 'GET', 'url': ENDPOINT, 'local_query': {'mode': 'exact_code', 'text': '29-1141.00'}}}
        source = {'id': 'onet', 'query': {'adapter': 'onet-json', 'cases': [case],
                                        'expected_inventory_sha256': hashlib.sha256(previous).hexdigest(),
                                        'expected_entry_count': 1}}
        capture = {'http': {'status': 200, 'truncated': False, 'sampled_bytes_sha256': hashlib.sha256(changed).hexdigest()},
                   'request': {'url': ENDPOINT}, 'robots_evidence': {}}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / 'examples').mkdir()
            with patch('occupational_inventory.REGISTRY', root):
                record_examples(source, capture, changed)
            row = json.loads((root / 'examples/onet.jsonl').read_text())
            self.assertEqual(row['verdict'], 'unverified')
            self.assertIn('Pinned occupation release changed', row['error'])

    def test_outage_throttle_and_truncation_stop_without_retry_or_false_success(self):
        case = {'id': 'nurses', 'expected_ids': ['29-1141.00'], 'request': {
            'method': 'GET', 'url': ENDPOINT, 'local_query': {'mode': 'exact_code', 'text': '29-1141.00'}}}
        source = {'id': 'onet', 'query': {'adapter': 'onet-json', 'cases': [case]}}
        valid_body = self.export([self.row()])
        for status, truncated in [(429, False), (503, False), (None, False), (200, True)]:
            with self.subTest(status=status, truncated=truncated), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); (root / 'examples').mkdir()
                http = {'status': status, 'truncated': truncated,
                        'sampled_bytes_sha256': hashlib.sha256(valid_body).hexdigest()}
                # Even a parseable prior/error payload cannot make a failed
                # current response count as verified. A probe never retries it.
                with patch('occupational_inventory.REGISTRY', root), \
                        patch('occupational_inventory.LOCK_PATH', root / 'lease'), \
                        patch('occupational_inventory.robots', return_value=(None, {})), \
                        patch('occupational_inventory.time.sleep'), \
                        patch('occupational_inventory.request', return_value=(http, valid_body)) as request:
                    probe(source)
                request.assert_called_once()
                row = json.loads((root / 'examples/onet.jsonl').read_text())
                self.assertEqual(row['verdict'], 'unverified')
                self.assertEqual(row['sample_results'], [])
                self.assertEqual(row['http']['status'], status)
                self.assertTrue(row['error'])


if __name__ == '__main__':
    unittest.main()
