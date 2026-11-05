import json
import unittest

from occupational_inventory import local_search, parse_onet


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


if __name__ == '__main__':
    unittest.main()
