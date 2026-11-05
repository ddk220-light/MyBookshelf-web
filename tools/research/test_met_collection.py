import unittest
from unittest import mock
import fcntl
import json
from pathlib import Path
import tempfile
from source_registry import normalize
import met_collection


class MetSubsetTests(unittest.TestCase):
    source = {'query': {'adapter': 'met-collection'}}

    def test_metadata_or_missing_image_is_not_full_public_domain_image_evidence(self):
        good = {'objectID': 123, 'title': 'Study', 'isPublicDomain': True, 'primaryImage': 'https://images.metmuseum.org/example.jpg'}
        result = normalize(self.source, good)[0]
        self.assertEqual(result['id'], '123')
        self.assertFalse(result['reading_access_verified'])
        for fields in [{'isPublicDomain': False}, {'isPublicDomain': 'true'}, {'primaryImage': ''},
                       {'objectID': True}, {'objectID': None}, {'title': ''}, {'title': 123},
                       {'title': '   '}, {'primaryImage': 'https://'}]:
            with self.assertRaises(ValueError):
                normalize(self.source, {**good, **fields})

    def test_equal_titles_and_accession_numbers_do_not_merge_native_objects(self):
        ids = [normalize(self.source, {'objectID': oid, 'title': 'Same title',
                   'accessionNumber': 'Shared accession', 'isPublicDomain': True,
                   'primaryImage': 'https://images.metmuseum.org/example.jpg'})[0]['id'] for oid in [1, 2]]
        self.assertEqual(ids, ['1', '2'])


class MetReplayPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        (root / 'examples').mkdir()
        self.output = root / 'examples/metmuseum.jsonl'
        self.lock = root / 'lease.lock'
        for name, value in [('REGISTRY', root), ('LOCK_PATH', self.lock)]:
            patch = mock.patch.object(met_collection, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        self.source = {'id': 'metmuseum', 'query': {'adapter': 'met-collection', 'cases': [
            {'id': f'object-{oid}', 'intent': 'Native identity replay', 'expected_ids': [str(oid)],
             'request': {'method': 'GET', 'url': f'https://collectionapi.metmuseum.org/public/collection/v1/objects/{oid}'}}
            for oid in [1, 2]]}}

    def test_policy_failure_or_disallow_never_sends_object_request(self):
        disallow = mock.Mock()
        disallow.can_fetch.return_value = False
        for policy in [False, disallow]:
            with self.subTest(policy=policy), mock.patch.object(met_collection, 'robots', return_value=(policy, {'status': 403})), \
                    mock.patch.object(met_collection, 'request') as request:
                met_collection.probe(self.source)
                request.assert_not_called()
        rows = [json.loads(line) for line in self.output.read_text().splitlines()]
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row['verdict'] == 'unverified' and row['http']['status'] is None for row in rows))

    def test_active_writer_prevents_policy_and_object_requests(self):
        with self.lock.open('a') as lock, mock.patch.object(met_collection, 'robots') as robots:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                met_collection.probe(self.source)
            robots.assert_not_called()
        self.assertFalse(self.output.exists())

    def test_redirect_and_access_errors_stop_before_next_case(self):
        for status in [302, 401, 403, 429, 503]:
            with self.subTest(status=status), mock.patch.object(met_collection, 'robots', return_value=(None, {'status': 404})), \
                    mock.patch.object(met_collection.time, 'sleep'), \
                    mock.patch.object(met_collection, 'request', return_value=({'status': status, 'truncated': False, 'redirect_location': 'https://other.example/'}, b'{}')) as request:
                met_collection.probe(self.source)
                self.assertEqual(request.call_count, 1)
        self.assertTrue(all(json.loads(line)['verdict'] == 'unverified' for line in self.output.read_text().splitlines()))

    def test_subset_rejections_keep_metadata_without_fetching_images(self):
        data = {'objectID': 1, 'title': 'Example', 'isPublicDomain': False, 'primaryImage': ''}
        with mock.patch.object(met_collection, 'robots', return_value=(None, {'status': 404})), \
                mock.patch.object(met_collection.time, 'sleep') as sleep, \
                mock.patch.object(met_collection, 'request', return_value=({'status': 200, 'truncated': False}, json.dumps(data).encode())) as request:
            met_collection.probe(self.source, ['object-1'])
            request.assert_called_once_with(self.source['query']['cases'][0]['request']['url'], met_collection.MAX_BYTES)
            sleep.assert_called_once_with(3)
        row = json.loads(self.output.read_text())
        self.assertEqual(row['verdict'], 'unverified')
        self.assertIs(row['observed_access_metadata']['isPublicDomain'], False)
