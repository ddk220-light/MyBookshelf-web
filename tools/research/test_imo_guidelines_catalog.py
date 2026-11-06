import copy,hashlib,json,tempfile,unittest
from pathlib import Path
from imo_guidelines_catalog import parse,search,assess,ENDPOINT
from small_catalog_coverage import verified_resolution_subset

def page(n=6):
 return ('<html>International Maritime Organization Maritime Knowledge Centre'+''.join(f'<a href="https://imo.libguides.com/ld.php?content_id={100+i}">MEPC.{196+i}(62) - 2011 GUIDELINE {i}</a>' for i in range(n))+'</html>').encode()

class IMOTests(unittest.TestCase):
 def test_symbols_and_no_legal_currentness_claim(self):
  rows=parse(page());self.assertEqual(len(rows),6);self.assertEqual(rows[0]['id'],'MEPC.196(62)');self.assertFalse(rows[0]['current_legal_status_verified'])
  self.assertEqual(search(rows,{'field':'title','value':'zzempty'}),[])
 def test_missing_attribution_incomplete_duplicate_and_external_links_rejected(self):
  for body in [page()[:-7],page().replace(b'International Maritime Organization',b'Other'),page().replace(b'imo.libguides.com/ld.php',b'other.example/ld.php'),page().replace(b'MEPC.197',b'MEPC.196')]:
   with self.assertRaises(ValueError):parse(body)
 def test_small_subset_needs_every_record_and_valid_capture(self):
  body=page();cap={'observed_at':'2026-11-06T00:00:00Z','http':{'status':200,'truncated':False,'url':ENDPOINT,'sampled_bytes_sha256':hashlib.sha256(body).hexdigest()}}
  cases=[{'id':str(i),'expected_ids':[r['id']],'request':{'method':'GET','url':ENDPOINT,'local_query':{'field':'title','value':r['title']}}} for i,r in enumerate(parse(body))]
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'page.html').write_bytes(body);proof={'source_id':'imo-knowledge-centre','capture_path':'page.html','capture':cap,'empty_query':'qzxnevermatch2026'};p=root/'proof.json';p.write_text(json.dumps(proof))
   source={'id':'imo-knowledge-centre','query':{'adapter':'imo-guidelines-catalog','cases':cases},'queryability_review':{'basis':'exhaustive-mkc-resolution-subset','evidence_path':'proof.json','evidence_sha256':hashlib.sha256(p.read_bytes()).hexdigest()}}
   self.assertTrue(verified_resolution_subset(source,{'passing_examples':6},root))
   broken=copy.deepcopy(source);broken['query']['cases']=cases[:-1];self.assertFalse(verified_resolution_subset(broken,{'passing_examples':6},root))
   self.assertFalse(verified_resolution_subset(source,{'passing_examples':5},root))
   (root/'page.html').write_bytes(body+b'changed')
   with self.assertRaises(ValueError):verified_resolution_subset(source,{'passing_examples':6},root)
 def test_failed_capture_never_verifies(self):
  b=page();case={'id':'one','expected_ids':['MEPC.196(62)'],'request':{'method':'GET','url':ENDPOINT,'local_query':{'field':'title','value':'196'}}}
  source={'id':'imo-knowledge-centre','query':{'adapter':'imo-guidelines-catalog'}}
  cap={'http':{'status':403,'truncated':False,'sampled_bytes_sha256':hashlib.sha256(b).hexdigest()}}
  self.assertEqual(assess(source,case,cap,b)['verdict'],'unverified')
