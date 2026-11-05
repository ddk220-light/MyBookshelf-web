import json
import unittest
from doaj_queries import parse, url, assess

class DoajQueryTests(unittest.TestCase):
 def payload(self):
  return {'page':1,'pageSize':3,'query':'title:mathematics','total':1,
          'results':[{'id':'a'*32,'bibjson':{'title':'Mathematics','author':[{'email':'discard@example.org'}],
             'identifier':[{'type':'doi','id':'10.1234/test'}],'journal':{'title':'A Journal'}}}]}
 def test_native_id_and_metadata_not_email_or_full_text(self):
  row=parse(json.dumps(self.payload()).encode(),url('title:mathematics'))['results'][0]
  self.assertEqual(row['id'],'a'*32);self.assertEqual(row['identifiers'][0]['type'],'doi')
  self.assertNotIn('author',row);self.assertFalse(row['reading_access_verified'])
 def test_query_page_identity_and_duplicates(self):
  for change in ({'query':'different'},{'page':2},{'pageSize':50},{'total':0}):
   with self.assertRaises(ValueError):parse(json.dumps({**self.payload(),**change}).encode(),url('title:mathematics'))
  d=self.payload();d['total']=2;d['results']*=2
  with self.assertRaises(ValueError):parse(json.dumps(d).encode(),url('title:mathematics'))
  d=self.payload();d['results'][0]['id']='not-native'
  with self.assertRaises(ValueError):parse(json.dumps(d).encode(),url('title:mathematics'))
 def test_empty_and_missing_hash_fail_closed(self):
  d=self.payload();d.update(results=[],total=0)
  self.assertEqual(parse(json.dumps(d).encode(),url('title:mathematics'))['results'],[])
  u=url('title:mathematics');c={'id':'math','expected_ids':['a'*32],'request':{'method':'GET','url':u}}
  row={'observed_at':'2026-11-05T00:00:00Z','outcome':'observed','request':c['request'],
       'http':{'status':200,'truncated':False,'url':u,'sampled_bytes_sha256':'b'*64},
       'parsed':parse(json.dumps(self.payload()).encode(),u)}
  s={'id':'doaj','query':{'adapter':'doaj-public'}}
  self.assertIn('hash',assess(s,c,row)['error'])
  row['response_sha256']='b'*64
  self.assertEqual(assess(s,c,row)['verdict'],'verified')

if __name__=='__main__':unittest.main()
