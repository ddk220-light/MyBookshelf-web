import unittest
from bnf_gallica_metadata import parse,make_request
class BnfMetadataTest(unittest.TestCase):
    def binding(self):
        return {'edition':{'type':'uri','value':'http://data.bnf.fr/ark:/12148/cb302791280#about'},'title':{'type':'typed-literal','datatype':'http://www.w3.org/2001/XMLSchema#string','value':"L'aquarium"},'gallica':{'type':'uri','value':'https://gallica.bnf.fr/ark:/12148/bpt6k165629z'}}
    def test_legacy_typed_string_and_native_digital_identity(self):
        b=self.binding();r=parse({'results':{'bindings':[b]}},"L'aquarium")[0]
        self.assertEqual(r['id'],'ark:/12148/bpt6k165629z');self.assertFalse(r['reading_access_verified'])
        b['title']['datatype']='http://www.w3.org/2001/XMLSchema#integer'
        with self.assertRaises(ValueError):parse({'results':{'bindings':[b]}},"L'aquarium")
    def test_wrong_title_or_provider_cannot_verify(self):
        b=self.binding()
        with self.assertRaises(ValueError):parse({'results':{'bindings':[b]}},'Different')
        b['gallica']['value']='https://other.example/ark:/12148/bpt6k165629z'
        with self.assertRaises(ValueError):parse({'results':{'bindings':[b]}},"L'aquarium")
    def test_title_literal_is_escaped_and_bounded(self):
        q=make_request('A" } UNION { ?s ?p ?o } #')['params']['query']
        self.assertIn('A\\" } UNION',q);self.assertTrue(q.endswith('LIMIT 3'))
        with self.assertRaises(ValueError):make_request('x'*1001)
