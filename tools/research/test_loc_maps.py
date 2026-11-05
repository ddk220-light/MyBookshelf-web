import copy
import unittest
from unittest.mock import patch

import loc_maps as maps
from source_registry import current_verified, evaluate


class MapCatalogTests(unittest.TestCase):
    def setUp(self):
        self.url = 'https://www.loc.gov/item/98687195/'
        self.row = {'id': 'http://www.loc.gov/item/98687195/', 'title': 'India',
                    'original_format': ['map'], 'access_restricted': False,
                    'date': '1903', 'resources': [{'url': 'https://www.loc.gov/resource/g7650.ct000283/'}]}
        self.req = {'method': 'GET', 'url': self.url, 'params': {'fo': 'json', 'at': 'item,resources'}}

    def test_copy_resources_are_not_new_bibliographic_items_or_access_proof(self):
        row = copy.deepcopy(self.row)
        row['resources'].append({'url': 'https://www.loc.gov/resource/g7650.copy2/'})
        got = maps.parse({'item': row}, self.url)
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]['native_resource_count'], 2)
        self.assertEqual(got[0]['date'], '1903')
        self.assertFalse(got[0]['reading_access_verified'])
        self.assertFalse(got[0]['georeferencing_verified'])

    def test_wrong_identity_format_access_and_destination_fail_closed(self):
        for changes in [{'id': 'http://www.loc.gov/item/123/'}, {'original_format': ['book']},
                        {'access_restricted': True}, {'access_restricted': None},
                        {'resources': []}, {'resources': [{'url': 'https://elsewhere.example/'}]}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                maps.parse({'item': {**self.row, **changes}}, self.url)

    def test_error_malformed_and_explicit_empty_are_distinct(self):
        endpoint = 'https://www.loc.gov/maps/'
        self.assertEqual(maps.parse({'results': []}, endpoint), [])
        for d in [{}, {'results': None}, {'error': 'bad q', 'results': []},
                  {'results': [self.row, self.row]}, {'item': {}}]:
            with self.assertRaises(ValueError):
                maps.parse(d, endpoint)

    def test_small_public_metadata_only(self):
        maps.allowed_request(self.req)
        for req in [{**self.req, 'method': 'POST'}, {**self.req, 'url': 'https://tile.loc.gov/file.tif'},
                    {**self.req, 'params': {'fo': 'json'}}, {**self.req, 'json': {'write': True}},
                    {'method': 'GET', 'url': 'https://www.loc.gov/maps/',
                     'params': {'fo': 'json', 'at': 'results,pagination', 'q': 'India', 'c': 100}}]:
            with self.assertRaises(ValueError):
                maps.allowed_request(req)

    def test_robots_denial_sends_no_target_request(self):
        with patch.object(maps, 'request') as request:
            row = maps.capture(self.req, False, {'status': 403})
        request.assert_not_called()
        self.assertEqual(row['outcome'], 'skipped')

    def test_map_type_required_in_stored_evidence(self):
        case = {'id': 'map-india', 'request': self.req, 'expected_ids': [self.row['id']], 'expected_work_type': 'map'}
        source = {'id': 'loc', 'query': {'adapter': 'loc', 'cases': [case]}}
        row = evaluate(source, case, {'http': {'status': 200, 'truncated': False}, 'observed_at': '2026-11-05T13:00:00Z'}, {'item': self.row})
        self.assertEqual(current_verified(source, [row]), 1)
        row['sample_results'][0].pop('type')
        self.assertEqual(current_verified(source, [row]), 0)
