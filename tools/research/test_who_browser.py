import unittest
from browser_publications import output_hash
from who_browser import ENDPOINT,assess,normalize

class WhoBrowserTests(unittest.TestCase):
 def test_native_ids_and_shortened_titles_preserved(self):
  row=normalize([{'title':'WHO malaria guidelines...','url':ENDPOINT+'/item/B09964','date':'4 November 2026'}])[0]
  self.assertEqual(row['id'],'B09964');self.assertTrue(row['title_may_be_abbreviated'])
  self.assertIsNone(row['edition_or_version']);self.assertFalse(row['reading_access_verified'])
 def test_foreign_and_duplicate_records_rejected(self):
  for u in ('https://iris.who.int/item/123',ENDPOINT+'/item/123?edition=2',ENDPOINT+'/other/123'):
   with self.assertRaises(ValueError):normalize([{'title':'Title','url':u,'date':''}])
  r={'title':'Title','url':ENDPOINT+'/item/B09964','date':''}
  with self.assertRaises(ValueError):normalize([r,r])
 def test_query_hash_relevance_and_summary_required(self):
  records=[{'title':'WHO guidelines for malaria','url':ENDPOINT+'/item/guidelines-for-malaria','date':'10 September 2026'}]
  row={'source_id':'who-publications','observed_at':'2026-11-05T00:00:00Z','endpoint':ENDPOINT,'final_url':ENDPOINT,'visible_query':'malaria','outcome':'observed','initial_http':{'status':200},'records':records,'observed_output_sha256':output_hash(records),'result_summary':['1-50 of283 items']}
  s={'id':'who-publications','query':{'adapter':'who-publications-ui'}};c={'id':'malaria','expected_ids':['guidelines-for-malaria'],'request':{'url':ENDPOINT,'method':'GET','ui_query':{'text':'malaria'}}}
  self.assertEqual(assess(s,c,row)['verdict'],'verified')
  for change in ({'visible_query':'water'},{'observed_output_sha256':'bad'},{'result_summary':[]},{'previous_output_sha256':row['observed_output_sha256']}):self.assertEqual(assess(s,c,{**row,**change})['verdict'],'unverified')
  records[0]['title']='Unrelated title';row['observed_output_sha256']=output_hash(records)
  self.assertIn('relevance',assess(s,c,row)['error'])

if __name__=='__main__':unittest.main()
