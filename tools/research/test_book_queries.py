import hashlib,json,unittest
from unittest.mock import patch
from book_queries import normalize,assess,query_url,capture
class BookTests(unittest.TestCase):
 def test_gutendex_public_domain_and_duplicate_ids(self):
  book={'id':11,'title':'Alice in Wonderland','copyright':False};d={'count':1,'results':[book]}
  self.assertEqual(normalize(d,'gutendex-books')[0]['id'],'11')
  for bad in [{'count':2,'results':[book,book]},{'count':1,'results':[{**book,'copyright':None}]},{'detail':'Not found'}]:
   with self.assertRaises(ValueError):normalize(bad,'gutendex-books')
 def test_work_edition_are_distinct_and_public(self):
  d={'numFound':1,'docs':[{'key':'/works/OL1W','title':'Mathematics','ebook_access':'public','editions':{'docs':[{'key':'/books/OL2M','title':'Mathematics'}]}}]}
  r=normalize(d,'openlibrary-search')[0];self.assertEqual(r['id'],'/works/OL1W');self.assertEqual(r['matching_editions'][0]['key'],'/books/OL2M')
  d['docs'][0]['ebook_access']='borrowable'
  with self.assertRaises(ValueError):normalize(d,'openlibrary-search')
 def test_free_google_volume_access_flags(self):
  r={'kind':'books#volume','id':'abcd-1','volumeInfo':{'title':'Mathematics'},'accessInfo':{'publicDomain':True,'viewability':'ALL_PAGES'},'saleInfo':{'saleability':'FREE'}}
  d={'kind':'books#volumes','totalItems':1,'items':[r]};self.assertEqual(normalize(d,'google-books-public')[0]['id'],'abcd-1')
  r['accessInfo']['viewability']='PARTIAL'
  with self.assertRaises(ValueError):normalize(d,'google-books-public')
 def test_hash_and_relevance_fail_closed(self):
  s={'id':'gutendex','query':{'adapter':'gutendex-books'}};req={'method':'GET','url':query_url('gutendex-books','Alice'),'query_text':'Alice','page':1};c={'id':'alice','request':req,'expected_ids':['11']};body=json.dumps({'count':1,'results':[{'id':11,'title':'Alice in Wonderland','copyright':False}]});sha=hashlib.sha256(body.encode()).hexdigest();cap={'request':req,'outcome':'captured','http':{'status':200,'truncated':False,'sampled_bytes_sha256':sha},'response_text':body,'response_sha256':sha}
  self.assertEqual(assess(s,c,cap)['verdict'],'verified');self.assertEqual(assess(s,c,{**cap,'response_text':body+' '})['verdict'],'unverified')
  wrong={**req,'query_text':'Agriculture'};self.assertEqual(assess(s,{**c,'request':wrong},{**cap,'request':wrong})['verdict'],'unverified')
 def test_transport_key_never_persisted(self):
  key='synthetic-test-key';body=b'{"kind":"books#volumes","totalItems":0}'
  def fake(url,**kw):
   self.assertTrue(url.endswith('&key='+key));return {'status':200,'url':url,'final_url':url,'error':'problem '+key,'truncated':False,'sampled_bytes_sha256':hashlib.sha256(body).hexdigest()},body
  with patch.dict('os.environ',{'GOOGLE_BOOKS_API_KEY':key}),patch('book_queries.request',side_effect=fake),patch('book_queries.time.sleep'):
   cap=capture('google-books-public','mathematics',1,None,{})
  self.assertNotIn(key,json.dumps(cap));self.assertNotIn('&key=',cap['http']['url']);self.assertNotIn('&key=',cap['http']['final_url'])
 def test_negative_empty_and_pagination_shapes(self):
  self.assertEqual(normalize({'count':0,'results':[]},'gutendex-books'),[])
  self.assertEqual(normalize({'numFound':0,'docs':[]},'openlibrary-search'),[])
  self.assertEqual(normalize({'kind':'books#volumes','totalItems':0},'google-books-public'),[])
  self.assertIn('startIndex=3',query_url('google-books-public','math',2))
  with self.assertRaises(ValueError):query_url('gutendex-books','',1)
