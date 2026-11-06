import copy
import unittest
from browser_publications import output_hash
from govinfo_browser import normalize,assess,query_url

class GovInfoTests(unittest.TestCase):
 def test_native_package_granule_identity(self):
  rows=[{'title':'Mathematics act','url':'https://www.govinfo.gov/app/details/STATUTE-104/STATUTE-104-Pg2881'}]
  r=normalize(rows)[0];self.assertEqual(r['id'],'STATUTE-104-Pg2881');self.assertEqual(r['package_id'],'STATUTE-104');self.assertFalse(r['reading_access_verified'])
  for bad in ['https://attacker.example/app/details/STATUTE-104','https://www.govinfo.gov/app/details/STATUTE-104?different=1']:
   with self.assertRaises(ValueError):normalize([{'title':'Mathematics','url':bad}])
 def test_query_and_hash_required(self):
  url=query_url('mathematics');s={'id':'govinfo','query':{'adapter':'govinfo-ui'}};c={'id':'math','expected_ids':['GOVPUB-1'],'request':{'method':'GET','url':url,'ui_query':{'text':'title:mathematics'}}};records=[{'title':'Mathematics assessment','url':'https://www.govinfo.gov/app/details/GOVPUB-1'}]
  row={'source_id':'govinfo','outcome':'observed','initial_http':{'status':200},'search_url':url,'endpoint':url,'visible_query':'title:mathematics','records':records,'observed_output_sha256':output_hash(records)}
  self.assertEqual(assess(s,c,row)['verdict'],'verified')
  for key,value in [('visible_query','title:chemistry'),('observed_output_sha256','0'*64),('search_url',query_url('chemistry'))]:
   changed={**row,key:value};self.assertEqual(assess(s,c,changed)['verdict'],'unverified')
