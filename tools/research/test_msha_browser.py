import unittest
from browser_publications import output_hash
from msha_browser import normalize,assess,ENDPOINT
class MSHATests(unittest.TestCase):
 def row(self):
  records=[{'title':'Sources of Dust in Coal Mines','metadata_url':'https://digitallibrary.msha.gov/aw-server/rest/order/user/product/download/55996?metadata=true','landing_page':'https://digitallibrary.msha.gov/#!/s?q=dust'}]
  return {'source_id':'msha-digital-library','observed_at':'2026-11-05T00:00:00Z','endpoint':ENDPOINT,'outcome':'observed','initial_http':{'status':200},'query':'dust','visible_query':'dust','guest_label':'Welcome, Public Research','search_url':records[0]['landing_page'],'records':records,'visible_titles':[records[0]['title']],'observed_output_sha256':output_hash(records)}
 def test_native_product_is_not_grid_rank(self):
  record=normalize(self.row()['records'])[0];self.assertEqual(record['id'],'55996');self.assertFalse(record['reading_access_verified']);self.assertIsNone(record['edition_or_year'])
  for url in ['https://other.org/aw-server/rest/order/user/product/download/55996?metadata=true','https://digitallibrary.msha.gov/aw-server/rest/order/user/product/download/55996']:
   with self.assertRaises(ValueError):normalize([{**self.row()['records'][0],'metadata_url':url}])
 def test_stale_or_tampered_search_rejected(self):
  s={'id':'msha-digital-library','query':{'adapter':'msha-public-ui'}};case={'id':'dust','expected_ids':['55996'],'request':{'method':'GET','url':ENDPOINT,'ui_query':{'text':'dust'}}}
  self.assertEqual(assess(s,case,self.row())['verdict'],'verified')
  for change in [{'visible_query':'roof'},{'search_url':'https://digitallibrary.msha.gov/#!/s?q=roof'},{'observed_output_sha256':'wrong'},{'guest_label':'Welcome, Private'},{'visible_titles':['Other title']}]:
   self.assertEqual(assess(s,case,{**self.row(),**change})['verdict'],'unverified')
if __name__=='__main__':unittest.main()
