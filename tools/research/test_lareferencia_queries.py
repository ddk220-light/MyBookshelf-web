import hashlib
import json
import tempfile
from pathlib import Path
import unittest
from lareferencia_queries import parse,query_url,assess,evidence_json
KEY='ES_'+'a'*32

def body(title='Water research',key=KEY,start=1):
 return (f'<form id="searchForm"><input name="lookfor" value="water"><select><option value="Title" selected>Title</option></select></form><ol class="record-list" start="{start}"><li class="result"><input class="hiddenId" value="{key}"><h2><a class="title" href="/Record/{key}?sid=temporary">{title}</a></h2><span class="publication-info">Published 2024</span><a class="fulltext" href="https://provider.example/handle/1">Read</a></li></ol>').encode()
class LAReferenciaTests(unittest.TestCase):
 def test_public_identifier_serialization_preserves_decoded_identity(self):
  value={'expected_ids':[KEY],'url':'https://buscador.lareferencia.info/Record/'+KEY,'country':'ES'}
  encoded=evidence_json(value,ensure_ascii=False)
  self.assertEqual(json.loads(encoded),value)
  self.assertIn('\\u0045S_',encoded)
  self.assertEqual(json.loads(evidence_json(json.loads(encoded))),value)
 def test_dossier_index_rewrite_preserves_public_id_representation(self):
  from capture_analysis import write_json
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'sources/la-referencia.json';p.parent.mkdir()
   value={'id':'la-referencia','expected_ids':[KEY]}
   write_json(p,value)
   self.assertEqual(json.loads(p.read_text()),value)
   self.assertIn('\\u0045S_',p.read_text())
 def test_native_identity_session_removed_provider_retained(self):
  r=parse(body(),query_url('water'))['results'][0];self.assertEqual(r['id'],KEY);self.assertNotIn('?sid',r['landing_page']);self.assertEqual(r['provider_item_links'],['https://provider.example/handle/1']);self.assertFalse(r['reader_access_verified'])
 def test_query_echo_native_identity_and_page_fail_closed(self):
  for b in [body().replace(b'value="water"',b'value="old"'),body().replace(b'value="Title" selected',b'value="AllFields" selected'),body(key='rank5'),body(start=11),b'<html>Verify you are human</html>']:
   with self.assertRaises(ValueError):parse(b,query_url('water'))
  self.assertEqual(parse(body(start=11),query_url('water',2))['start'],11)
 def test_empty_explicit_not_absent_parser(self):
  prefix=body().split(b'<ol')[0]
  self.assertTrue(parse(prefix+b'No Results!',query_url('water'))['empty_confirmed'])
  with self.assertRaises(ValueError):parse(prefix,query_url('water'))
 def test_hash_http_and_relevance(self):
  b=body();u=query_url('water');s={'id':'la-referencia','query':{'adapter':'lareferencia-title'}};c={'id':'water','expected_ids':[KEY],'request':{'method':'GET','url':u}}
  cap={'observed_at':'2026-11-05T00:00:00Z','http':{'url':u,'status':200,'truncated':False,'sampled_bytes_sha256':hashlib.sha256(b).hexdigest()}}
  self.assertEqual(assess(s,c,cap,b)['verdict'],'verified')
  for update in [{'truncated':True},{'status':403},{'sampled_bytes_sha256':'wrong'}]:self.assertEqual(assess(s,c,{**cap,'http':{**cap['http'],**update}},b)['verdict'],'unverified')
if __name__=='__main__':unittest.main()
