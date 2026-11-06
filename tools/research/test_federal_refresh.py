"""Regression tests for evidence refreshes, not a runtime ingestion pipeline."""
import copy
import unittest
from civic_catalogs import check_federal_filters, parse_federal, review_federal_refresh
from test_civic_catalogs import document


class FederalRefreshTests(unittest.TestCase):
    def capture(self):
        return {'observed_output': document(), 'outcome': 'captured',
                'request': {'method': 'GET', 'url': 'https://www.federalregister.gov/api/v1/documents/2023-28799.json'},
                'response_sha256': 'a'*64, 'http': {'status': 200, 'truncated': False, 'sampled_bytes_sha256': 'a'*64}}

    def test_unavailable_document_does_not_delete_history_or_establish_repeal(self):
        old = self.capture()
        for status in (404, 403, 429, 503, None):
            candidate = copy.deepcopy(old); candidate['http']['status'] = status
            candidate['outcome'] = 'blocked-or-failed'
            result = review_federal_refresh(old, candidate)
            self.assertEqual(result['retained_ids'], ['2023-28799'])
            self.assertEqual(result['removed_ids'], [])
            self.assertFalse(result['replace_accepted'])
            self.assertFalse(result['current_law_verified'])
            self.assertTrue(result['snapshot_stale'])

    def test_corruption_or_scope_changes_cannot_establish_a_fresh_snapshot(self):
        old = self.capture()
        for key, value in [('response_sha256', None), ('response_sha256', 'b'*64),
                           ('request', {'url': 'https://www.federalregister.gov/api/v1/documents.json'})]:
            candidate = copy.deepcopy(old); candidate[key] = value
            self.assertEqual(review_federal_refresh(old, candidate)['status'], 'candidate-rejected')
        candidate = copy.deepcopy(old); candidate['http']['truncated'] = True
        self.assertEqual(review_federal_refresh(old, candidate)['status'], 'candidate-rejected')

    def test_changed_correction_action_or_effective_date_requires_review(self):
        old = self.capture()
        for field, value in [('action', 'Final rule; withdrawal.'), ('effective_on', '2025-01-01'),
                             ('corrections', ['https://www.federalregister.gov/api/v1/documents/C2-2023-28799'])]:
            candidate = copy.deepcopy(old); candidate['observed_output'][field] = value
            result = review_federal_refresh(old, candidate)
            self.assertEqual(result['status'], 'manual-review-required')
            self.assertEqual(result['changed_ids'], ['2023-28799'])
            self.assertFalse(result['current_law_verified'])
            self.assertFalse(result['replace_accepted'])

    def test_topic_page_disappearance_is_not_catalog_deletion(self):
        old = self.capture(); old['request']['url'] = 'https://www.federalregister.gov/api/v1/documents.json'
        old['observed_output'] = {'count': 1, 'results': [document()]}
        candidate = copy.deepcopy(old); candidate['observed_output'] = {'count': 0}
        result = review_federal_refresh(old, candidate)
        self.assertEqual(result['missing_from_page_ids'], ['2023-28799'])
        self.assertEqual(result['removed_ids'], [])
        self.assertEqual(result['status'], 'manual-review-required')

    def test_wrong_native_identity_and_non_native_correction_links_are_rejected(self):
        rows = parse_federal(document())
        with self.assertRaises(ValueError):
            check_federal_filters(rows, {'url': 'https://www.federalregister.gov/api/v1/documents/2024-99999.json'})
        for field, value in [('correction_of', 'https://evil.test/C1-2023-28799'),
                             ('corrections', 'not-an-array'), ('action', {'legal_status': 'current'})]:
            item = document(); item[field] = value
            with self.assertRaises(ValueError): parse_federal(item)

    def test_identical_observation_is_not_an_extra_query_example(self):
        result = review_federal_refresh(self.capture(), self.capture())
        self.assertEqual(result['status'], 'unchanged')
        self.assertFalse(result['query_verified'])
        self.assertFalse(result['snapshot_stale'])


if __name__ == '__main__': unittest.main()
