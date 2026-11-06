import copy
import unittest
from unittest.mock import patch

import tatoeba_catalog as catalog


class SentenceContractTests(unittest.TestCase):
    def setUp(self):
        self.req = {'method': 'GET', 'url': 'https://api.tatoeba.org/v1/sentences',
                    'params': {'lang': 'hin', 'q': 'पानी', 'sort': 'relevance', 'limit': 3,
                               'is_unapproved': 'no', 'is_orphan': 'no', 'showtrans': 'none'}}
        self.item = {'id': 13873686, 'text': 'पानी बहता है।', 'lang': 'hin', 'script': None,
                     'license': 'CC BY 2.0 FR', 'owner': 'sabretou', 'is_unapproved': False}
        self.data = {'data': [self.item], 'paging': {'has_next': False, 'total': 1}}

    def test_native_unicode_and_attribution_do_not_imply_accuracy(self):
        item = catalog.parse(self.data, self.req)[0]
        self.assertEqual(item['title'], 'पानी बहता है।')
        self.assertEqual(item['attribution_owner'], 'sabretou')
        self.assertFalse(item['pedagogical_accuracy_verified'])
        self.assertFalse(item['reading_access_verified'])

    def test_wrong_language_or_native_id_is_not_a_match(self):
        self.item['lang'] = 'mar'
        with self.assertRaises(ValueError):
            catalog.parse(self.data, self.req)
        req = {'method': 'GET', 'url': 'https://api.tatoeba.org/v1/sentences/1',
               'params': {'showtrans': 'none'}}
        with self.assertRaises(ValueError):
            catalog.parse({'data': self.item}, req)

    def test_unsafe_rights_and_unapproved_or_orphan_rows_fail(self):
        for key, value in [('license', 'PROBLEM'), ('license', None),
                           ('owner', None), ('is_unapproved', True), ('is_unapproved', 0)]:
            with self.subTest(key=key, value=value):
                data = copy.deepcopy(self.data)
                data['data'][0][key] = value
                with self.assertRaises(ValueError):
                    catalog.parse(data, self.req)

    def test_empty_is_distinct_from_missing_or_duplicate_data(self):
        self.assertEqual(catalog.parse({'data': [], 'paging': {'has_next': False, 'total': 0}}, self.req), [])
        for data in [{}, {'data': None}, {**self.data, 'data': [self.item, self.item]}]:
            with self.assertRaises(ValueError):
                catalog.parse(data, self.req)

    def test_foreign_cursor_and_unbounded_modes_rejected(self):
        self.data['paging'] = {'has_next': True, 'total': 2, 'next': 'https://elsewhere.example/v1/sentences'}
        with self.assertRaises(ValueError):
            catalog.parse(self.data, self.req)
        for changes in [{'limit': 300}, {'include': 'audios'}, {'is_orphan': 'yes'}, {'lang': 'eng,hin'}]:
            req = copy.deepcopy(self.req)
            req['params'].update(changes)
            with self.assertRaises(ValueError):
                catalog.allowed_request(req)

    def test_policy_denial_does_not_send_request(self):
        with patch.object(catalog, 'request') as request:
            result = catalog.capture(self.req, False, {'status': 403})
        request.assert_not_called()
        self.assertEqual(result['outcome'], 'skipped')

    def test_cursor_page_can_omit_total_without_becoming_empty(self):
        self.data['paging'] = {'has_next': True,
                               'next': 'https://api.tatoeba.org/v1/sentences?after=10097%2C13054920'}
        self.assertEqual(len(catalog.parse(self.data, self.req)), 1)
        self.data['paging']['total'] = 0
        with self.assertRaises(ValueError):
            catalog.parse(self.data, self.req)


if __name__ == '__main__':
    unittest.main()
