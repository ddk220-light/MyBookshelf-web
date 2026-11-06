import unittest
from gutendex_native import make_request,parse
class NativeGutendexTest(unittest.TestCase):
    def test_native_identity_and_reported_access(self):
        row=parse({'id':84,'title':'Frankenstein','copyright':None,'languages':['en']},'84')[0]
        self.assertEqual(row['id'],'84');self.assertIsNone(row['reported_copyright']);self.assertFalse(row['reading_access_verified'])
        with self.assertRaises(ValueError):parse({'id':84,'title':'Frankenstein'},'85')
    def test_exact_canonical_public_route_only(self):
        self.assertEqual(make_request('84')['url'],'https://gutendex.com/books/84/')
        for bad in ['0','../search','84?search=other',84]:
            with self.assertRaises(ValueError):make_request(bad)
