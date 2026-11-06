import hashlib,json,unittest
from free_kids_metadata import parse,assess,query_url

class FreeKidsMetadataTests(unittest.TestCase):
 def test_native_ids_and_publication_links_with_entities(self):
  row={'id':12,'type':'post','title':{'rendered':'Cat &amp; Dog'},'link':'https://freekidsbooks.org/cat-dog/'}
  self.assertEqual(parse(json.dumps([row]).encode())[0]['title'],'Cat & Dog')
  for bad in ([row,row],[{**row,'link':'https://other.example/book/'}],{'code':'rest_forbidden','message':'Forbidden'}):
   with self.assertRaises(ValueError):parse(json.dumps(bad).encode())
  self.assertEqual(parse(b'[]'),[])
 def test_expected_book_must_match_title_and_capture_hash(self):
  source={'id':'free-kids-books','query':{'adapter':'free-kids-wp-metadata'}}
  case={'id':'cat','query_text':'Cat','expected_ids':['12'],'request':{'method':'GET','url':query_url('Cat')}}
  body=json.dumps([{'id':12,'type':'post','title':{'rendered':'Education'},'link':'https://freekidsbooks.org/education/'}]);sha=hashlib.sha256(body.encode()).hexdigest()
  cap={'http':{'status':200,'truncated':False,'sampled_bytes_sha256':sha},'response_text':body,'response_sha256':sha,'request':case['request']}
  self.assertEqual(assess(source,case,cap)['verdict'],'unverified')
  cap['http']['sampled_bytes_sha256']='0'*64
  self.assertIn('mismatched',assess(source,case,cap)['error'])
