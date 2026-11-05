import unittest

from source_registry import current_verified, evaluate, fingerprint, request_url


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.case = {'id': 'known-title-01', 'intent': 'Known title lookup', 'expected_ids': ['42'],
                     'request': {'method': 'GET', 'url': 'https://example.org/api', 'params': {'q': 'calculus'}}}
        self.source = {'id': 'fixture', 'query': {'adapter': 'mediawiki', 'endpoint': 'https://example.org/api', 'cases': [self.case]}}
        self.obs = {'observed_at': '2026-11-05T01:00:00+00:00', 'http': {'status': 200, 'truncated': False},
                    'response_sha256': 'a' * 64, 'error': None}
        self.good = {'query': {'search': [{'pageid': 42, 'title': 'Calculus'}]}}

    def result(self, data=None, obs=None):
        return evaluate(self.source, self.case, obs or self.obs, self.good if data is None else data)

    def test_http_success_does_not_prove_expected_record(self):
        for data in ({'query': {'search': []}}, {'query': {'search': [{'pageid': 43, 'title': 'Unrelated'}]}},
                     {'error': {'code': 'maxlag'}}, {}, '<html>verification</html>'):
            self.assertEqual(self.result(data)['verdict'], 'unverified')

    def test_json_pair_arrays_preserve_repeated_query_fields(self):
        url = request_url({'url': 'https://archive.org/advancedsearch.php', 'params': [['fl[]', 'title'], ['fl[]', 'identifier']]})
        self.assertEqual(url, 'https://archive.org/advancedsearch.php?fl%5B%5D=title&fl%5B%5D=identifier')

    def test_match_is_preserved_in_small_sample(self):
        rows = [{'pageid': i, 'title': str(i)} for i in range(10)] + [{'pageid': 42, 'title': 'Calculus'}]
        result = self.result({'query': {'search': rows}})
        self.assertEqual(result['verdict'], 'verified')
        self.assertEqual(result['sample_results'][0]['id'], '42')
        self.assertEqual(len(result['sample_results']), 3)

    def test_language_host_comes_from_actual_request(self):
        self.case['request']['url'] = 'https://ta.wikisource.org/w/api.php'
        self.assertEqual(self.result()['sample_results'][0]['landing_page'], 'https://ta.wikisource.org/?curid=42')

    def test_latest_failure_invalidates_previous_success(self):
        good = self.result()
        bad = self.result({}, {**self.obs, 'observed_at': '2026-11-06T01:00:00+00:00'})
        self.assertEqual(current_verified(self.source, [bad, good]), 0)

    def test_duplicate_retries_and_duplicate_cases_count_once(self):
        result = self.result()
        self.assertEqual(current_verified(self.source, [result, result]), 1)
        self.source['query']['cases'].append({**self.case, 'id': 'duplicate'})
        self.assertEqual(current_verified(self.source, [result, {**result, 'case_id': 'duplicate'}]), 1)

    def test_changed_query_or_expectation_requires_new_evidence(self):
        result = self.result()
        self.case['request'] = {**self.case['request'], 'params': {'q': 'biology'}}
        self.assertEqual(current_verified(self.source, [result]), 0)
        self.case['expected_ids'] = ['99']
        result['request_fingerprint'] = fingerprint(self.case['request'])
        self.assertEqual(current_verified(self.source, [result]), 0)

    def test_error_or_truncation_never_passes(self):
        for change in ({'http': {'status': 429, 'truncated': False}}, {'http': {'status': 200, 'truncated': True}}, {'error': 'Timeout'}):
            self.assertEqual(self.result(obs={**self.obs, **change})['verdict'], 'unverified')

    def test_thoth_excludes_retail_and_unreviewed_hosts(self):
        self.source['query'].update(adapter='thoth', official_content_hosts=['books.publisher.example'])
        data = {'data': {'works': [{'workId': '42', 'titles': [{'fullTitle': 'A Book'}], 'publications': [
            {'publicationType': 'PAPERBACK', 'locations': [{'canonical': True, 'fullTextUrl': 'https://books.publisher.example/buy'}]},
            {'publicationType': 'PDF', 'locations': [{'canonical': True, 'fullTextUrl': 'https://unreviewed.example/book.pdf'},
                {'canonical': True, 'fullTextUrl': 'https://books.publisher.example/book.pdf'}]}]}]}}
        links = self.result(data)['sample_results'][0]['canonical_digital_links']
        self.assertEqual(links, [{'format': 'PDF', 'url': 'https://books.publisher.example/book.pdf'}])


if __name__ == '__main__':
    unittest.main()
