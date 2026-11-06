import copy
import unittest
from unittest.mock import patch

import eurostat_catalog as e


def cell(value=108.9):
    codes = ['A', 'PER_KM2', 'EU27_2020', '2022']
    return {'class': 'dataset', 'version': '2.0', 'source': 'ESTAT', 'label': 'Population density',
            'id': e.DIMENSIONS, 'size': [1, 1, 1, 1], 'updated': '2026-02-25T23:00:00+0100',
            'dimension': {dim: {'category': {'index': {code: 0}, 'label': {code: code}}}
                          for dim, code in zip(e.DIMENSIONS, codes)},
            'value': {'0': value}, 'status': {'0': 'bep'},
            'extension': {'id': e.DATASET, 'lang': 'EN', 'version': '1.0',
                          'datastructure': {'id': e.DATASET, 'version': '33.0'},
                          'status': {'label': {'bep': 'break in time series, estimated, provisional'}}}}


class EurostatTests(unittest.TestCase):
    def test_full_native_dimensions_flags_and_structure_version_are_retained(self):
        r = e.parse_cell(cell(), 'EU27_2020', '2022')
        self.assertEqual(r['id'], 'ESTAT:DEMO_R_D3DENS:freq=A:unit=PER_KM2:geo=EU27_2020:time=2022')
        self.assertEqual(r['status_flag'], 'bep')
        self.assertIn('provisional', r['status_label'])
        self.assertEqual(r['datastructure']['version'], '33.0')
        self.assertFalse(r['reading_access_verified'])

    def test_sparse_missing_null_and_real_zero_are_not_conflated(self):
        for data in [cell(None), {**cell(), 'value': {}}]:
            r = e.parse_cell(data, 'EU27_2020', '2022')
            self.assertIsNone(r['value'])
            self.assertFalse(r['value_available'])
        self.assertTrue(e.parse_cell(cell(0), 'EU27_2020', '2022')['value_available'])

    def test_wrong_geography_period_unit_or_dataset_is_rejected(self):
        for data, geo, year in [(cell(), 'DE', '2022'), (cell(), 'EU27_2020', '2023')]:
            with self.assertRaises(ValueError):
                e.parse_cell(data, geo, year)
        for dim in e.DIMENSIONS:
            data = cell()
            data['dimension'][dim]['category']['index'] = {'WRONG': 0}
            with self.assertRaises(ValueError):
                e.parse_cell(data, 'EU27_2020', '2022')
        data = cell()
        data['extension']['id'] = 'OTHER_DATASET'
        with self.assertRaises(ValueError):
            e.parse_cell(data, 'EU27_2020', '2022')

    def test_broad_cube_provider_error_and_non_numeric_values_fail_closed(self):
        for data in [{**cell(), 'size': [1, 1, 2, 1]}, {'error': 'bad filter'},
                     cell(True), cell('108.9'), cell(float('nan')),
                     {**cell(), 'value': {'0': 108.9, '1': 100}}]:
            with self.assertRaises(ValueError):
                e.parse_cell(data, 'EU27_2020', '2022')

    def test_unknown_flag_is_preserved_without_invented_label(self):
        data = cell()
        data['status']['0'] = 'unknown'
        r = e.parse_cell(data, 'EU27_2020', '2022')
        self.assertEqual(r['status_flag'], 'unknown')
        self.assertIsNone(r['status_label'])

    def test_policy_and_country_scope_block_network_before_access(self):
        params = {'lang': 'EN', 'geo': 'DE', 'time': '2022', 'freq': 'A', 'unit': 'PER_KM2'}
        with patch.object(e, 'request') as request:
            self.assertEqual(e.capture(params, False, {})['outcome'], 'skipped')
            for changed in [{**params, 'geo': 'US'}, {**params, 'time': '2020:2022'},
                            {**params, 'unit': 'NR'}, {**params, 'page': 2}]:
                with self.assertRaises(ValueError):
                    e.capture(changed, None, {})
            request.assert_not_called()
