import unittest
from storyweaver_browser import normalize,query_url
class StoryWeaverTests(unittest.TestCase):
 def test_native_story_identity(self):
  r={'url':'https://storyweaver.org.in/en/stories/15961-lion-on-the-loose','title':'Lion on the loose'}
  self.assertEqual(normalize([r])[0]['id'],'15961')
  self.assertFalse(normalize([r])[0]['reading_access_verified'])
  for u in ['https://example.org/en/stories/15961-lion','https://storyweaver.org.in/en/stories/15961-lion?secret=x','https://storyweaver.org.in/en/search']:
   with self.assertRaises(ValueError):normalize([{**r,'url':u}])
  with self.assertRaises(ValueError):normalize([r,r])
 def test_supported_query_shape(self):
  self.assertEqual(query_url('lion'),'https://storyweaver.org.in/en/search?intent=1&query=lion&tab=matches&language=English')
  for q in ['', 'lion&secret=yes',None]:
   with self.assertRaises(ValueError):query_url(q)

 def test_tampered_or_stale_output_cannot_pass(self):
  from storyweaver_browser import assess
  from browser_publications import output_hash
  source={'id':'storyweaver','query':{'adapter':'storyweaver-ui'}}
  case={'id':'lion','request':{'url':query_url('lion'),'ui_query':{'text':'lion'}},'expected_ids':['15961']}
  records=[{'url':'https://storyweaver.org.in/en/stories/15961-lion-on-the-loose','title':'Lion on the loose'}]
  row={'source_id':'storyweaver','outcome':'observed','search_http_status':200,'search_url':query_url('lion'),'query_echo':'lion','language_filter':'English','records':records,'observed_output_sha256':output_hash(records)}
  self.assertEqual(assess(source,case,row)['verdict'],'verified')
  for changed in [{'observed_output_sha256':'bad'},{'query_echo':'cat'},{'language_filter':'Hindi'}]:
   self.assertEqual(assess(source,case,{**row,**changed})['verdict'],'unverified')
