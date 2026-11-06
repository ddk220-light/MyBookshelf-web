import unittest
from nqr_browser import parse, checked_case

class NqrMetadataTest(unittest.TestCase):
    def test_native_qualification_and_relevance(self):
        rows=parse([{'title':'Construction Helper Electrician 270 Hrs Level 2','url':'https://www.nqr.gov.in/qualifications/13770'}],'Helper Electrician')
        self.assertEqual(rows[0]['id'],'13770')
        with self.assertRaisesRegex(ValueError,'Irrelevant'):
            parse([{'title':'Software Developer','url':'https://www.nqr.gov.in/qualifications/13770'}],'Helper Electrician')

    def test_navigation_downloads_and_other_hosts_are_not_items(self):
        for url in ['https://www.nqr.gov.in/search#a','https://www.nqr.gov.in/download/a.pdf','https://example.org/qualifications/13770']:
            with self.assertRaisesRegex(ValueError,'native qualification'):
                parse([{'title':'Electrician','url':url}],'Electrician')

    def test_only_advertised_browser_form(self):
        case={'query_text':'Electrician','request':{'method':'POST','url':'https://www.nqr.gov.in/search','execution':'public-browser','form':{'querySearch':'Electrician','_token':'ephemeral form token, omitted'}}}
        self.assertEqual(checked_case(case),'https://www.nqr.gov.in/search')
        case['request']['form']['querySearch']='other'
        with self.assertRaises(ValueError):checked_case(case)
