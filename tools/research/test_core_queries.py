import json
import unittest
from core_queries import parse,url

class CoreQueryTests(unittest.TestCase):
 def payload(self):return {'limit':1,'offset':0,'totalHits':1,'results':[{'id':123,'title':'Mathematics','fullText':'Not available for public API users.','links':[{'type':'display','url':'https://core.ac.uk/works/123'}],'outputs':['https://api.core.ac.uk/v3/outputs/456'],'identifiers':[{'type':'oai','identifier':'oai:repo:456'}]}]}
 def test_work_and_output_identity_not_collapsed(self):
  row=parse(json.dumps(self.payload()).encode(),url('title:"mathematics"'))['results'][0]
  self.assertEqual(row['id'],'123');self.assertEqual(row['output_count'],1);self.assertIn('/outputs/456',row['output_urls'][0]);self.assertNotIn('fullText',row)
 def test_reject_unexpected_full_text_and_mismatched_ids(self):
  for change in ({'fullText':'Actual article body must stop collector'},{'id':'invalid'},{'links':[{'type':'display','url':'https://other.org/works/123'}]}):
   d=self.payload();d['results'][0].update(change)
   with self.assertRaises(ValueError):parse(json.dumps(d).encode(),url('title:"mathematics"'))
 def test_paging_limits_and_empty_envelope(self):
  for change in ({'limit':2},{'offset':1},{'totalHits':0}):
   with self.assertRaises(ValueError):parse(json.dumps({**self.payload(),**change}).encode(),url('title:"mathematics"'))
  d=self.payload();d.update(results=[],totalHits=0)
  self.assertEqual(parse(json.dumps(d).encode(),url('title:"mathematics"'))['results'],[])

if __name__=='__main__':unittest.main()
