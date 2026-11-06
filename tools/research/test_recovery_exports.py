import json
import unittest
from artic_catalog import parse, assess
from scholarly_queries import parse_nist
from nga_catalog import search

class RecoveryExportTests(unittest.TestCase):
    def test_artwork_native_identity_and_missing_titles(self):
        record = {'id': 123, 'title': 'Priest and Boy', 'artist_title': 'Example Artist', 'department_title': 'Prints', 'main_reference_number': '1880.1'}
        body = (json.dumps(record)+'\n').encode()
        rows = parse(body)
        self.assertEqual(search(rows, {'mode':'title_tokens','text':'boy priest'})[0]['id'], '123')
        self.assertEqual(search(rows, {'mode':'artist_tokens','text':'artist'})[0]['id'], '123')
        self.assertEqual(search(rows, {'mode':'title_tokens','text':'noexactmatch'}), [])
        self.assertFalse(rows[0]['reading_access_verified'])
        with self.assertRaises(ValueError):parse(body+body)
        with self.assertRaises(ValueError):parse(body[:-1])
        missing = parse((json.dumps({**record, 'title':None, 'artist_title':None})+'\n').encode())
        self.assertTrue(missing[0]['title_missing'])
        self.assertEqual(search(missing, {'mode':'title_tokens','text':'untitled'}), [])

    def test_artwork_hash_mismatch_cannot_verify(self):
        source={'id':'art-institute-chicago','query':{'adapter':'artic-export','export_git_blob_sha':'correct'}}
        case={'id':'test','expected_ids':['123'],'request':{'method':'GET','url':'https://example.org/export','local_query':{'mode':'native_id','text':'123'}}}
        cap={'observed_at':'2026-11-06T00:00:00Z','http':{'url':case['request']['url'],'status':200,'truncated':False,'sampled_bytes_sha256':'different'},'response_sha256':'one','git_blob_sha':'correct','robots_evidence':{}}
        obs=assess(source,case,cap,[{'id':'123','title':'Real','title_missing':False}])
        self.assertEqual(obs['verdict'],'unverified')

    def test_nist_does_not_accept_other_publisher_prefix(self):
        def response(doi):return json.dumps({'status':'ok','message-type':'work-list','message':{'items':[{'DOI':doi,'title':['Test report']}],'total-results':1}}).encode()
        row=parse_nist(response('10.6028/NIST.SP.800-53r5'))['results'][0]
        self.assertEqual(row['id'],'10.6028/nist.sp.800-53r5')
        self.assertEqual(row['metadata_provider'],'Crossref')
        with self.assertRaises(ValueError):parse_nist(response('10.5555/not-nist'))
