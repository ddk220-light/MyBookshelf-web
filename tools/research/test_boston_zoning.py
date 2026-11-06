import copy
import json
import unittest
from unittest.mock import patch
import boston_zoning as b


def req():
    return {'method': 'GET', 'url': b.BASE+'/query', 'params': {'f': 'json', 'where': "DISTRICT = 'Charlestown'", 'outFields': ','.join(b.FIELDS), 'returnGeometry': 'false', 'orderByFields': 'OBJECTID ASC', 'resultOffset': 0, 'resultRecordCount': 5}}


def page():
    return {'features': [{'attributes': {'OBJECTID': 3, 'DISTRICT': 'Charlestown', 'STAGE': None, 'MAPNO': '2A', 'ARTICLE': '62', 'VOLUME': 'I'}}]}


class BostonZoningTests(unittest.TestCase):
    def test_native_record_does_not_establish_legal_effect(self):
        result = b.parse(page(), req())[0]
        self.assertEqual(result['id'], '3')
        self.assertIsNone(result['attributes']['STAGE'])
        self.assertFalse(result['legal_status_verified'])

    def test_errors_duplicates_wrong_ids_and_ignored_filters_fail(self):
        bad = page(); bad['features'] *= 2
        for data in [{'error': {'code': 400}}, bad]:
            with self.assertRaises(ValueError): b.parse(data, req())
        request = req(); request['params']['where'] = "DISTRICT = 'Back Bay'"
        with self.assertRaises(ValueError): b.parse(page(), request)
        request = req(); del request['params']['where']; request['params']['objectIds'] = 4
        with self.assertRaises(ValueError): b.parse(page(), request)
        self.assertEqual(b.parse({'features': []}, req()), [])

    def test_unexpected_personal_fields_and_geometry_are_rejected(self):
        bad = page(); bad['features'][0]['attributes']['OWNER'] = 'fixture'
        with self.assertRaises(ValueError): b.parse(bad, req())
        bad = page(); bad['features'][0]['geometry'] = {}
        with self.assertRaises(ValueError): b.parse(bad, req())
        bad = page(); bad['features'][0]['attributes']['OBJECTID'] = True
        with self.assertRaises(ValueError): b.parse(bad, req())

    def test_request_cannot_edit_expand_scope_or_inject_sql(self):
        requests = []
        for key, value in [('method', 'POST'), ('url', b.BASE+'/applyEdits'), ('url', b.BASE.replace('/0','/1')+'/query')]:
            r = req(); r[key] = value; requests.append(r)
        for key, value in [('where', "DISTRICT = 'x' OR 1=1"), ('outFields', '*'), ('resultRecordCount', 2000), ('returnGeometry', 'true')]:
            r = req(); r['params'][key] = value; requests.append(r)
        with patch.object(b, 'request') as network:
            for r in requests:
                with self.assertRaises(ValueError): b.capture(r, None, {})
            network.assert_not_called()

    def test_policy_denial_does_not_request(self):
        with patch.object(b, 'request') as network:
            result = b.capture(req(), False, {'status': 403})
            network.assert_not_called()
        self.assertEqual(result['outcome'], 'skipped')

    def test_unavailable_or_truncated_response_is_not_empty_success(self):
        for status, truncated in [(429, False), (503, False), (None, False), (200, True)]:
            with patch.object(b, 'request', return_value=({'status': status, 'truncated': truncated, 'sampled_bytes_sha256':'a'*64}, b'{}')), patch.object(b.time, 'sleep'):
                result = b.capture(req(), None, {})
            self.assertEqual(result['outcome'], 'blocked-or-failed')
            self.assertNotIn('observed_output', result)


    def test_capture_omits_unexpected_personal_values(self):
        data=page();data['features'][0]['attributes']['OWNER']='synthetic forbidden value'
        http={'status':200,'truncated':False,'sampled_bytes_sha256':'a'*64}
        with patch.object(b,'request',return_value=(http,json.dumps(data).encode())),patch.object(b.time,'sleep'):
            result=b.capture(req(),None,{})
        self.assertEqual(result['outcome'],'invalid-response')
        self.assertNotIn('observed_output',result)
        self.assertNotIn('synthetic forbidden value',json.dumps(result))


if __name__ == '__main__': unittest.main()
