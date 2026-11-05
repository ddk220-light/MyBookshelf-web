import copy,unittest
from archive_texts import make_request,allowed_request,parse
class ArchiveTextsTests(unittest.TestCase):
 def test_bounded_private_field_free_request(self):
  r=make_request('title:mathematics');allowed_request(r)
  bad=copy.deepcopy(r);bad['params'].append(['fl[]','uploader'])
  with self.assertRaises(ValueError):allowed_request(bad)
  bad=copy.deepcopy(r);bad['params'][0][1]='mediatype:texts AND title:mathematics'
  with self.assertRaises(ValueError):allowed_request(bad)
 def test_public_domain_claim_required_but_not_verified(self):
  d={'response':{'numFound':1,'docs':[{'identifier':'math-book','title':'Mathematics','mediatype':'texts','date':'1900-01-01','licenseurl':'http://creativecommons.org/publicdomain/mark/1.0/'}]}}
  r=parse(d)[0];self.assertEqual(r['id'],'math-book');self.assertFalse(r['reuse_permission_verified']);self.assertFalse(r['reading_access_verified'])
  del d['response']['docs'][0]['licenseurl']
  with self.assertRaises(ValueError):parse(d)
 def test_empty_is_not_failure_and_duplicate_is(self):
  self.assertEqual(parse({'response':{'numFound':0,'docs':[]}}),[])
  r={'identifier':'x','title':'Title','mediatype':'texts','date':'1900-01-01','licenseurl':'https://creativecommons.org/publicdomain/zero/1.0/'}
  with self.assertRaises(ValueError):parse({'response':{'numFound':2,'docs':[r,r]}})
