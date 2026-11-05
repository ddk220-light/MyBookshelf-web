import copy
import unittest
from unittest.mock import patch

import landportal_catalog as catalog


class LandPortalMetadataTests(unittest.TestCase):
    def setUp(self):
        self.row = {'dataset': {'type': 'uri', 'value': catalog.PREFIX + 'AFRB-SURV'},
                    'label': {'type': 'literal', 'value': 'Afrobarometer Survey'}}
        self.data = {'head': {'vars': ['dataset', 'label']}, 'results': {'bindings': [self.row]}}

    def test_dataset_identity_is_not_person_or_value_evidence(self):
        row = catalog.parse(self.data)[0]
        self.assertEqual(row['native_dataset_id'], 'AFRB-SURV')
        self.assertFalse(row['data_values_verified'])
        self.assertFalse(row['owner_records_collected'])
        self.assertEqual(row['type'], 'dataset-metadata')

    def test_graph_scope_mutation_and_remote_service_rejected(self):
        req = catalog.make_request('AFRB-SURV')
        catalog.allowed_request(req)
        for replacement in ['SELECT * WHERE {?person ?p ?o}', 'DROP ALL',
                            req['params']['query'].replace('datasets.landportal.info', 'data.landportal.info'),
                            req['params']['query'] + ' SERVICE <https://example.org> {?s ?p ?o}']:
            value = copy.deepcopy(req)
            value['params']['query'] = replacement
            with self.assertRaises(ValueError):
                catalog.allowed_request(value)

    def test_query_injection_and_unbounded_paging_rejected(self):
        for sid in ['x> } UNION { ?s ?p ?o', '../person', 'http://elsewhere.example/id']:
            with self.assertRaises(ValueError):
                catalog.make_request(sid)
        with self.assertRaises(ValueError):
            catalog.make_request(offset=100000)

    def test_error_missing_columns_and_explicit_empty_are_distinct(self):
        self.assertEqual(catalog.parse({'head': {'vars': ['dataset', 'label']}, 'results': {'bindings': []}}), [])
        for data in [{}, {'head': None}, {'head': {'vars': ['person']}, 'results': {'bindings': []}},
                     {'error': 'timeout', **self.data}, {**self.data, 'results': None}]:
            with self.assertRaises(ValueError):
                catalog.parse(data)

    def test_catalog_root_foreign_id_nonliteral_and_duplicate_rejected(self):
        for row in [{**self.row, 'dataset': {'type': 'uri', 'value': 'http://data.landportal.info/catalog'}},
                    {**self.row, 'dataset': {'type': 'uri', 'value': catalog.PREFIX + 'FAO-SDG_2.3.2/observation/FAO-SI_AGR_SSFP_ALB_2005'}},
                    {**self.row, 'label': {'type': 'uri', 'value': 'https://example.org/label'}},
                    {**self.row, 'label': {'type': 'literal', 'value': 'Titre', 'xml:lang': 'fr'}}]:
            with self.assertRaises(ValueError):
                catalog.parse({**self.data, 'results': {'bindings': [row]}})
        with self.assertRaises(ValueError):
            catalog.parse({**self.data, 'results': {'bindings': [self.row, self.row]}})

    def test_policy_block_preserved_without_target_request(self):
        with patch.object(catalog, 'request') as request:
            row = catalog.capture(catalog.make_request(), False, {'status': 503})
        request.assert_not_called()
        self.assertEqual(row['outcome'], 'skipped')
