import unittest
import json
from unittest.mock import patch
from source_registry import normalize, evaluate, current_verified
from openalex_metadata import fetch_singleton


class OpenAlexMetadataTests(unittest.TestCase):
    source = {'id': 'openalex', 'query': {'adapter': 'openalex'}}

    def work(self):
        return {'id': 'https://openalex.org/W42', 'title': 'A study', 'open_access': {'is_oa': True},
                'best_oa_location': {'landing_page_url': 'https://example.org/paper', 'license': 'cc-by',
                                     'version': 'acceptedVersion'}, 'is_retracted': True}

    def test_singleton_and_list_keep_version_retraction_and_reading_uncertainty(self):
        item = normalize(self.source, self.work())[0]
        self.assertEqual(item, normalize(self.source, {'results': [self.work()]})[0])
        self.assertTrue(item['is_retracted'])
        self.assertEqual(item['best_oa_location']['version'], 'acceptedVersion')
        self.assertFalse(item['reading_access_verified'])

    def test_error_wrong_entity_closed_access_and_duplicate_fail(self):
        for payload in [{'error': 'limit'}, {'results': [self.work(), self.work()]},
                        {**self.work(), 'id': 'https://openalex.org/A42'},
                        {**self.work(), 'open_access': {'is_oa': False}},
                        {**self.work(), 'open_access': None}, {**self.work(), 'title': 42}]:
            with self.assertRaises(ValueError):
                normalize(self.source, payload)

    def test_empty_is_not_a_verified_example(self):
        case = {'id': 'x', 'request': {'method': 'GET', 'url': 'https://api.openalex.org/works'},
                'expected_ids': ['https://openalex.org/W42']}
        row = evaluate(self.source, case, {'http': {'status': 200, 'truncated': False}, 'error': None}, {'results': []})
        self.assertEqual(row['verdict'], 'unverified')

    def test_thesis_identity_requires_the_observed_work_type(self):
        case = {'id': 'thesis', 'expected_ids': ['https://openalex.org/W42'],
                'expected_work_type': 'dissertation',
                'request': {'method': 'GET', 'url': 'https://api.openalex.org/works/W42'}}
        obs = {'observed_at': '2026-11-05T13:00:00Z', 'http': {'status': 200, 'truncated': False}}
        for kind in (None, 'article', 'dissertation'):
            row = evaluate(self.source, case, obs, {**self.work(), 'type': kind})
            self.assertEqual(row['verdict'], 'verified' if kind == 'dissertation' else 'unverified')

    def test_historical_article_cannot_satisfy_a_new_thesis_expectation(self):
        case = {'id': 'native', 'expected_ids': ['https://openalex.org/W42'],
                'request': {'method': 'GET', 'url': 'https://api.openalex.org/works/W42'}}
        obs = {'observed_at': '2026-11-05T13:00:00Z', 'http': {'status': 200, 'truncated': False}}
        row = evaluate(self.source, case, obs, {**self.work(), 'type': 'article'})
        source = {**self.source, 'query': {**self.source['query'], 'cases': [case]}}
        self.assertEqual(current_verified(source, [row]), 1)
        case['expected_work_type'] = 'dissertation'
        self.assertEqual(current_verified(source, [row]), 0)

    def test_existing_key_is_sent_only_in_memory_and_not_saved_in_evidence(self):
        req = {'method': 'GET', 'url': 'https://api.openalex.org/works/W42', 'params': {'select': 'id,title'}}
        with patch('openalex_metadata.request', return_value=({'status': 200, 'truncated': False}, json.dumps(self.work()).encode())) as request:
            obs, data = fetch_singleton(req, 'fixture-secret', None, {'status': 404})
        self.assertEqual(request.call_args.kwargs['headers']['Authorization'], 'Bearer fixture-secret')
        self.assertNotIn('fixture-secret', json.dumps(obs))
        self.assertEqual(data['id'], 'https://openalex.org/W42')

    def test_missing_key_search_and_policy_denial_never_send_request(self):
        req = {'method': 'GET', 'url': 'https://api.openalex.org/works/W42'}
        with patch('openalex_metadata.request') as request:
            with self.assertRaises(ValueError):
                fetch_singleton(req, None, None, {})
            with self.assertRaises(ValueError):
                fetch_singleton({**req, 'url': 'https://api.openalex.org/works'}, 'key', None, {})
            with self.assertRaises(ValueError):
                fetch_singleton({**req, 'params': {'search': 'something'}}, 'key', None, {})
            obs, _ = fetch_singleton(req, 'key', False, {'status': 403})
            self.assertIsNone(obs['http']['status'])
            request.assert_not_called()


if __name__ == '__main__':
    unittest.main()
