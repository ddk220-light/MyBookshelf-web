import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import civic_catalogs as c


def document():
    return {'document_number': '2023-28799', 'title': 'Airworthiness Directives; Airbus SAS Airplanes',
            'type': 'Rule', 'publication_date': '2024-01-03', 'effective_on': None,
            'html_url': 'https://www.federalregister.gov/documents/2024/01/03/2023-28799/title',
            'correction_of': None, 'corrections': ['https://www.federalregister.gov/api/v1/documents/C1-2023-28799']}


def budget():
    return {'toptier_code': '012', 'messages': ['Reporting may lag'], 'agency_data_by_year': [
        {'fiscal_year': 2024, 'agency_budgetary_resources': 0, 'agency_total_obligated': 0,
         'agency_total_outlayed': 0, 'total_budgetary_resources': 123,
         'agency_obligation_by_period': [{'period': 12, 'obligated': 0}]}]}


class CivicCatalogTests(unittest.TestCase):
    def test_document_number_year_is_not_publication_year_and_corrections_stay_distinct(self):
        d = document(); row = c.parse_federal(d)[0]
        self.assertEqual(row['id'], '2023-28799')
        self.assertEqual(row['publication_date'], '2024-01-03')
        self.assertFalse(row['current_law_verified'])
        d['document_number'] = 'C1-2023-28799'; d['html_url'] = d['html_url'].replace('/2023-', '/C1-2023-')
        self.assertEqual(c.parse_federal(d)[0]['id'], 'C1-2023-28799')

    def test_invalid_document_identity_date_type_or_provider_error_rejected(self):
        for field, value in [('publication_date', 'yesterday'), ('html_url', 'https://example.com/2023-28799'),
                             ('title', ''), ('type', 'current-law')]:
            d = document(); d[field] = value
            with self.assertRaises(ValueError): c.parse_federal(d)
        with self.assertRaises(ValueError): c.parse_federal({'error': 'unknown document'})
        with self.assertRaises(ValueError): c.parse_federal({'results': [document(), document()]})
        self.assertEqual(c.parse_federal({'count': 0, 'results': []}), [])
        self.assertEqual(c.parse_federal({'count': 0, 'description': 'No matching documents'}), [])

    def test_budget_zero_null_and_missing_fields_are_different(self):
        d = budget(); agency = {'name': 'USDA', 'slug': 'department-of-agriculture'}
        self.assertTrue(c.parse_budget(d, '012', agency)[0]['data_available'])
        d['agency_data_by_year'][0]['agency_budgetary_resources'] = None
        self.assertFalse(c.parse_budget(d, '012', agency)[0]['data_available'])
        del d['agency_data_by_year'][0]['agency_total_obligated']
        with self.assertRaises(ValueError): c.parse_budget(d, '012', agency)

    def test_agency_code_fiscal_year_and_reporting_period_identity(self):
        a = {'name': 'USDA', 'slug': 'department-of-agriculture'}
        with self.assertRaises(ValueError): c.parse_budget(budget(), '12', a)
        d = budget(); d['agency_data_by_year'].append(copy.deepcopy(d['agency_data_by_year'][0]))
        with self.assertRaises(ValueError): c.parse_budget(d, '012', a)
        for field, value in [('fiscal_year', True), ('agency_total_outlayed', float('nan')),
                             ('agency_obligation_by_period', [{'period': 13, 'obligated': 1}])]:
            d = budget(); d['agency_data_by_year'][0][field] = value
            with self.assertRaises(ValueError): c.parse_budget(d, '012', a)

    def test_research_scope_rejects_recipient_queries_bulk_fields_and_wrong_hosts(self):
        requests = [('usaspending', {'method': 'GET', 'url': 'https://api.usaspending.gov/api/v2/awards/', 'local_query': {'fiscal_year': 2024}}),
                    ('federal-register', {'method': 'GET', 'url': 'https://www.federalregister.gov/api/v1/documents.json', 'params': {'fields[]': ['raw_text_url'], 'per_page': 1000}}),
                    ('federal-register', {'method': 'GET', 'url': 'https://www.federalregister.gov.evil.test/api/v1/documents.json', 'params': {'fields[]': c.FIELDS}})]
        with patch.object(c, 'request') as network:
            for sid, req in requests:
                with self.assertRaises(ValueError): c.capture(sid, req, None, {})
            network.assert_not_called()

    def test_policy_denial_does_not_request(self):
        req = {'method': 'GET', 'url': 'https://api.usaspending.gov/api/v2/agency/012/budgetary_resources/', 'local_query': {'fiscal_year': 2024}}
        with patch.object(c, 'request') as network:
            row = c.capture('usaspending', req, False, {'status': 403})
        network.assert_not_called(); self.assertEqual(row['outcome'], 'skipped')

    def test_invalid_year_is_rejected_before_provider_normalizes_it(self):
        req = {'method': 'GET', 'url': 'https://www.federalregister.gov/api/v1/documents.json',
               'params': {'fields[]': c.FIELDS, 'conditions[publication_date][year]': 'notayear'}}
        with patch.object(c, 'request') as network:
            with self.assertRaises(ValueError): c.capture('federal-register', req, None, {})
        network.assert_not_called()

    def test_successful_http_cannot_hide_ignored_year_or_type_filters(self):
        rows = c.parse_federal(document())
        for params in [{'conditions[publication_date][year]': 2025}, {'conditions[type][]': 'PRORULE'}]:
            with self.assertRaises(ValueError): c.check_federal_filters(rows, {'params': params})
        c.check_federal_filters(rows, {'params': {'conditions[publication_date][year]': 2024, 'conditions[type][]': 'RULE'}})

    def test_null_only_budget_probe_is_preserved_unverified(self):
        req = {'method': 'GET', 'url': 'https://api.usaspending.gov/api/v2/agency/012/budgetary_resources/', 'local_query': {'fiscal_year': 2024}}
        source = {'id': 'usaspending', 'query': {'adapter': 'usaspending', 'endpoint': req['url'],
                  'agencies': {'012': {'name': 'USDA', 'slug': 'department-of-agriculture'}},
                  'cases': [{'id': 'null-year', 'request': req, 'expected_ids': ['012:2024']}]}}
        d = budget(); d['agency_data_by_year'][0]['agency_total_obligated'] = None
        row = {'outcome': 'captured', 'observed_output': d, 'http': {'status': 200, 'truncated': False}, 'observed_at': '2026-11-05T00:00:00Z'}
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp); (p/'examples').mkdir()
            with patch.object(c, 'REGISTRY', p), patch.object(c, 'LOCK', p/'lock'), patch.object(c, 'robots', return_value=(None, {})), patch.object(c, 'capture', return_value=row):
                c.probe(source)
            out = json.loads((p/'examples/usaspending.jsonl').read_text())
        self.assertEqual(out['verdict'], 'unverified'); self.assertEqual(len(out['missing_observations']), 1)


if __name__ == '__main__': unittest.main()
