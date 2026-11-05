import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import world_bank_indicators as wb


def payload(value=0, country='IND', year='2023'):
    return [{'page': 1, 'pages': 1, 'per_page': 10, 'total': 1,
             'sourceid': '2', 'lastupdated': '2026-10-08'},
            [{'indicator': {'id': 'SP.POP.TOTL', 'value': 'Population, total'},
              'country': {'id': 'IN' if country == 'IND' else 'US', 'value': 'India' if country == 'IND' else 'United States'},
              'countryiso3code': country, 'date': year, 'value': value,
              'unit': '', 'decimal': 0, 'obs_status': '', 'footnote': 'Provider footnote'}]]


class IndicatorEvidenceTests(unittest.TestCase):
    def test_country_period_and_dataset_are_part_of_identity(self):
        a, b, c = [wb.parse_data(data)[0] for data in [payload(), payload(country='USA'), payload(year='2024')]]
        self.assertEqual(len({a['id'], b['id'], c['id']}), 3)
        self.assertEqual(a['id'], '2:SP.POP.TOTL:IND:2023')
        self.assertEqual(a['dataset_last_updated'], '2026-10-08')
        self.assertFalse(a['reading_access_verified'])
        self.assertEqual(a['footnote'], 'Provider footnote')

    def test_null_and_zero_are_distinct_without_inventing_units(self):
        missing, zero = wb.parse_data(payload(None))[0], wb.parse_data(payload(0))[0]
        self.assertIsNone(missing['value'])
        self.assertFalse(missing['value_available'])
        self.assertEqual(zero['value'], 0)
        self.assertTrue(zero['value_available'])
        self.assertEqual(zero['unit'], '')
        data = payload()
        del data[1][0]['value']
        with self.assertRaises(ValueError):
            wb.parse_data(data)

    def test_observed_empty_page_has_no_native_identity_or_invented_update(self):
        header = {'lastupdated': None, 'page': 0, 'pages': 0, 'per_page': 0, 'sourceid': None, 'total': 0}
        self.assertEqual(wb.parse_data([header, None]), [])
        with self.assertRaises(ValueError):
            wb.parse_data([{**header, 'sourceid': '11'}, None])

    def test_provider_errors_wrong_dataset_and_invalid_values_never_become_data(self):
        for bad in [None, {}, [{'message': [{'id': '120', 'key': 'Invalid value'}]}]]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                wb.parse_data(bad)
        for value in [True, '42', float('nan'), float('inf')]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                wb.parse_data(payload(value))
        for field, value in [('sourceid', '11'), ('lastupdated', '2026-13-08')]:
            data = payload()
            data[0][field] = value
            with self.assertRaises(ValueError):
                wb.parse_data(data)

    def test_duplicate_or_wrong_geography_period_is_rejected(self):
        data = payload()
        data[1].append(copy.deepcopy(data[1][0]))
        with self.assertRaises(ValueError):
            wb.parse_data(data)
        for data in [payload(country='WLD'), payload(year='2023Q1')]:
            with self.assertRaises(ValueError):
                wb.parse_data(data)

    def test_policy_and_request_caps_prevent_network_calls(self):
        with mock.patch.object(wb, 'request') as request:
            row = wb.capture(wb.BASE + '/sources', {'format': 'json', 'per_page': 10}, False, {'status': 403})
            self.assertEqual(row['outcome'], 'skipped')
            for params in [{'format': 'json', 'per_page': 11}, {'format': 'json', 'downloadformat': 'csv'}]:
                with self.assertRaises(ValueError):
                    wb.capture(wb.BASE + '/sources', params, None, {})
            request.assert_not_called()

    def test_null_only_observation_is_saved_but_not_a_passing_example(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'examples').mkdir()
            request = {'method': 'GET', 'url': wb.BASE + '/country/IND/indicator/SP.POP.TOTL',
                       'params': {'format': 'json', 'source': 2, 'date': '2023', 'per_page': 10}}
            source = {'id': 'world-bank-indicators', 'query': {'adapter': 'world-bank-indicators', 'cases': [
                {'id': 'null', 'intent': 'Actual value required', 'expected_ids': ['2:SP.POP.TOTL:IND:2023'], 'request': request}]}}
            data = payload(None)
            row = {'outcome': 'captured', 'observed_at': '2026-11-05T10:00:00+00:00',
                   'http': {'status': 200, 'truncated': False}, 'observed_output': data,
                   'response_sha256': hashlib.sha256(json.dumps(data).encode()).hexdigest()}
            with mock.patch.object(wb, 'REGISTRY', root), mock.patch.object(wb, 'LOCK_PATH', root / 'lock'), \
                    mock.patch.object(wb, 'robots', return_value=(None, {})), mock.patch.object(wb, 'capture', return_value=row):
                wb.probe(source)
            observed = json.loads((root / 'examples/world-bank-indicators.jsonl').read_text())
            self.assertEqual(observed['verdict'], 'unverified')
            self.assertIsNone(observed['missing_observations'][0]['value'])
            self.assertEqual(observed['observed_output'], data)
