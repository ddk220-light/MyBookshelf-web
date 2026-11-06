import json, unittest, hashlib
from recovery_queries import parse_nasa, parse_lever, parse_caltech, assess

class RecoveryQueries(unittest.TestCase):
    def test_native_nasa_identity_and_media_scope(self):
        row={'data':[{'nasa_id':'PIA123','title':'Mars image','media_type':'image'}]}
        body=json.dumps({'collection':{'items':[row]}}).encode()
        self.assertEqual(parse_nasa(body)[0]['id'],'PIA123')
        for data in [{'error':'unavailable'},{'collection':{'items':[row,row]}},{'collection':{'items':[{'data':[{'nasa_id':'x','title':'Mars','media_type':'video'}]}]}}]:
            with self.assertRaises(ValueError):parse_nasa(json.dumps(data).encode())
    def test_publisher_scope_echo_native_identity_and_empty(self):
        body=b'<input name="q" value="Otium"><article class="blacklight-monograph"><a href="/concern/monographs/08612s29c?locale=en"><h3 class="index_title">Otium: Work</h3></a></article>'
        row=parse_lever(body,'Otium')[0]
        self.assertEqual(row['title'],'Otium: Work');self.assertEqual(row['id'],'08612s29c')
        self.assertFalse(row['reading_access_verified'])
        with self.assertRaises(ValueError):parse_lever(body,'Mars')
        with self.assertRaises(ValueError):parse_lever(b'<input name="q" value="Otium">Login required','Otium')
        self.assertEqual(parse_lever(b'<input name="q" value="missing">No results found','missing'),[])
    def test_failed_response_and_unrelated_result_cannot_verify(self):
        source={'id':'nasa-image-video-library','query':{'adapter':'nasa-images-public'}}
        case={'id':'x','query_text':'Mars','request':{'method':'GET','url':'https://images-api.nasa.gov/search?q=Mars'},'expected_ids':['PIA123']}
        body=json.dumps({'collection':{'items':[{'data':[{'nasa_id':'PIA123','title':'Venus','media_type':'image'}]}]}}).encode()
        cap={'observed_at':'2026-11-06T00:00:00Z','http':{'status':200,'truncated':False,'sampled_bytes_sha256':hashlib.sha256(body).hexdigest()}}
        self.assertEqual(assess(source,case,cap,body)['verdict'],'unverified')
        cap['http']['status']=403;self.assertEqual(assess(source,case,cap,body)['verdict'],'unverified')
        cap['http']['status']=200;cap['http']['sampled_bytes_sha256']='bad';self.assertEqual(assess(source,case,cap,body)['verdict'],'unverified')

    def test_caltech_uses_native_thesis_urls_and_observed_title_relevance(self):
        rows=[{'title':'Quantum mechanics','url':'https://thesis.caltech.edu/123/'}]
        self.assertEqual(parse_caltech(rows,'quantum')[0]['id'],'123')
        with self.assertRaises(ValueError):parse_caltech(rows,'astronomy')
        with self.assertRaises(ValueError):parse_caltech(rows+rows,'quantum')
        with self.assertRaises(ValueError):parse_caltech([{'title':'Quantum mechanics','url':'https://other.example/123/'}],'quantum')

    def test_browser_contract_rejects_arbitrary_urls_and_mismatched_hash(self):
        from caltech_browser import checked_case, assess as browser_assess
        case={'id':'q','query_text':'quantum','request':{'method':'GET','execution':'public-browser','url':'https://thesis.caltech.edu/search.html?q=quantum'},'expected_ids':['123']}
        self.assertEqual(checked_case(case),case['request']['url'])
        bad={**case,'request':{**case['request'],'url':'https://other.example/search.html?q=quantum'}}
        with self.assertRaises(ValueError):checked_case(bad)
        source={'id':'caltech-thesis','query':{'adapter':'caltech-public-browser'}}
        cap={'observed_at':'2026-11-06T00:00:00Z','http':{'status':200,'truncated':False},'records':[{'title':'Quantum mechanics','url':'https://thesis.caltech.edu/123/'}],'rendered_result_sha256':'0'*64}
        self.assertEqual(browser_assess(source,case,cap)['verdict'],'unverified')
