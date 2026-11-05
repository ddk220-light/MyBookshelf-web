import copy
import json
import unittest
from unittest.mock import patch

import archive_education as catalog


class EducationalArchiveTests(unittest.TestCase):
    def setUp(self):
        self.req = catalog.make_request('title:physics')
        self.row = {'identifier': 'MITRES10.S95F20', 'title': 'Physics of COVID-19 Transmission',
                    'mediatype': 'movies', 'licenseurl': 'https://creativecommons.org/licenses/by-nc-sa/4.0/'}

    def test_native_course_item_is_not_lecture_or_automatic_license_access_proof(self):
        got = catalog.parse({'response': {'numFound': 1, 'docs': [self.row]}})[0]
        self.assertEqual(got['id'], 'MITRES10.S95F20')
        self.assertIn('playlist', got['record_scope'])
        self.assertFalse(got['reading_access_verified'])
        self.assertFalse(got['reuse_permission_verified'])

    def test_wrong_media_duplicate_and_empty_malformed_responses(self):
        self.assertEqual(catalog.parse({'response': {'numFound': 0, 'docs': []}}), [])
        for d in [{}, {'response': {'docs': []}}, {'error': 'bad query'},
                  {'response': {'numFound': 2, 'docs': [self.row, self.row]}},
                  {'response': {'numFound': 1, 'docs': [{**self.row, 'mediatype': 'texts'}]}}]:
            with self.assertRaises(ValueError):
                catalog.parse(d)

    def test_personal_fields_and_scope_override_rejected(self):
        catalog.allowed_request(self.req)
        for pair in [['fl[]', 'collection'], ['fl[]', 'uploader'], ['q', 'unrestricted'], ['rows', 100]]:
            req = copy.deepcopy(self.req)
            req['params'].append(pair)
            with self.assertRaises(ValueError):
                catalog.allowed_request(req)
        for suffix in ['title:physics OR economics', 'identifier:x OR mediatype:account']:
            with self.assertRaises(ValueError):
                catalog.allowed_request(catalog.make_request(suffix))

    def test_robots_denial_has_no_target_request(self):
        with patch.object(catalog, 'request') as request:
            row = catalog.capture(self.req, False, {'status': 403})
        request.assert_not_called()
        self.assertEqual(row['outcome'], 'skipped')

    def test_unsolicited_personal_metadata_is_not_persisted(self):
        body = json.dumps({'response': {'numFound': 1, 'docs': [{**self.row, 'uploader': 'private-placeholder', 'collection': ['fav-placeholder']}]}}).encode()
        with patch.object(catalog, 'request', return_value=({'status': 200, 'truncated': False, 'sampled_bytes_sha256': 'a'*64}, body)), patch.object(catalog.time, 'sleep'):
            row = catalog.capture(self.req, None, {'status': 404})
        stored = row['observed_output']['response']['docs'][0]
        self.assertNotIn('uploader', stored)
        self.assertNotIn('collection', stored)
        self.assertIn('privacy_minimization', row)

    def test_throttle_retains_failure_without_retry(self):
        with patch.object(catalog, 'request', return_value=({'status': 429, 'truncated': False, 'sampled_bytes_sha256': 'b'*64}, b'{"error":"rate limit"}')) as request, patch.object(catalog.time, 'sleep'):
            row = catalog.capture(self.req, None, {'status': 404})
        self.assertEqual(request.call_count, 1)
        self.assertEqual(row['outcome'], 'blocked-or-failed')
