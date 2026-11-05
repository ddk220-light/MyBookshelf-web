import copy
import unittest
from unittest.mock import patch

import appropedia_catalog as catalog


class PracticalCatalogTests(unittest.TestCase):
    def setUp(self):
        self.req = {'method': 'GET', 'url': catalog.ENDPOINT, 'params': {
            'action': 'query', 'format': 'json', 'formatversion': 2, 'maxlag': 5,
            'prop': 'info|revisions', 'pageids': 4026, 'rvprop': 'ids|timestamp',
            'rvlimit': 1, 'inprop': 'url'}}
        self.row = {'pageid': 4026, 'ns': 0, 'title': 'Practical Action/Micro-irrigation',
                    'pagelanguage': 'en', 'fullurl': 'https://www.appropedia.org/Practical_Action/Micro-irrigation',
                    'canonicalurl': 'https://www.appropedia.org/Practical_Action/Micro-irrigation',
                    'revisions': [{'revid': 123, 'parentid': 122, 'timestamp': '2026-01-08T23:24:24Z'}]}

    def test_revision_identity_is_separate_from_mutable_title(self):
        r = catalog.parse({'query': {'pages': [self.row]}}, self.req)[0]
        self.assertEqual(r['id'], '4026')
        self.assertEqual(r['revision_id'], 123)
        self.assertEqual(r['parent_revision'], 122)
        self.assertFalse(r['procedural_safety_verified'])

    def test_wrong_native_id_revision_and_external_reader_fail(self):
        for changes in [{'pageid': 4027}, {'revisions': []}, {'ns': 2},
                        {'canonicalurl': 'https://elsewhere.example/page'}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                catalog.parse({'query': {'pages': [{**self.row, **changes}]}}, self.req)

    def test_explicit_missing_differs_from_empty_malformed_or_error(self):
        self.assertEqual(catalog.parse({'query': {'pages': [{'pageid': 4026, 'missing': True}]}}, self.req), [])
        for d in [{}, {'query': {'pages': [{'pageid': 4027, 'missing': True}]}},
                  {'error': {'code': 'badvalue'}, 'query': {'pages': [self.row]}},
                  {'warnings': {'query': 'ignored field'}, 'query': {'pages': [self.row]}}]:
            with self.assertRaises(ValueError):
                catalog.parse(d, self.req)

    def test_write_and_content_or_user_fields_are_rejected(self):
        catalog.allowed_request(self.req)
        for changes in [{'action': 'edit'}, {'rvprop': 'content|user'}, {'rvlimit': 50},
                        {'pageids': '1|2'}, {'meta': 'tokens'}]:
            req = copy.deepcopy(self.req)
            req['params'].update(changes)
            with self.assertRaises(ValueError):
                catalog.allowed_request(req)

    def test_exact_published_policy_redirect_can_end_in_missing_file(self):
        first = {'status': 301, 'redirect_location': 'https://www.appropedia.org/Robots.txt'}
        with patch.object(catalog, 'robots', return_value=(False, first)), \
                patch.object(catalog, 'request', return_value=({'status': 404, 'truncated': True}, b'')) as request, \
                patch.object(catalog.time, 'sleep'):
            rule, proof = catalog.policy()
        self.assertIsNone(rule)
        self.assertEqual(len(proof['redirect_chain']), 2)
        request.assert_called_once_with(first['redirect_location'], 65536)

    def test_unexpected_redirect_or_access_denial_stays_blocked(self):
        with patch.object(catalog, 'robots', return_value=(False, {'status': 301, 'redirect_location': 'https://elsewhere.example/robots.txt'})), \
                patch.object(catalog, 'request') as request:
            rule, _ = catalog.policy()
        self.assertIs(rule, False)
        request.assert_not_called()
        first = {'status': 301, 'redirect_location': 'https://www.appropedia.org/Robots.txt'}
        with patch.object(catalog, 'robots', return_value=(False, first)), \
                patch.object(catalog, 'request', return_value=({'status': 403}, b'')), \
                patch.object(catalog.time, 'sleep'):
            rule, _ = catalog.policy()
        self.assertIs(rule, False)

    def test_html_200_policy_is_not_permission(self):
        with patch.object(catalog, 'robots', return_value=(object(), {'status': 200, 'content_type': 'text/html'})):
            rule, _ = catalog.policy()
        self.assertIs(rule, False)

    def test_policy_denial_prevents_target_request(self):
        with patch.object(catalog, 'request') as request:
            result = catalog.capture(self.req, False, {'status': 403})
        request.assert_not_called()
        self.assertEqual(result['outcome'], 'skipped')


if __name__ == '__main__':
    unittest.main()
