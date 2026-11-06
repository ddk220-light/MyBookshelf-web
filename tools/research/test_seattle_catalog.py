import unittest
from seattle_catalog import parse,make_request,ENDPOINT
class SeattleCatalogTest(unittest.TestCase):
    def test_metadata_identity_and_relevance(self):
        sid='a'*32
        x={'type':'FeatureCollection','features':[{'id':sid,'properties':{'id':sid,'title':'Streetcar Stations','access':'public'},'links':[{'rel':'self','href':ENDPOINT+'/'+sid}]}]}
        r=parse(x,'Streetcar Stations')[0];self.assertEqual(r['id'],sid);self.assertFalse(r['underlying_data_requested'])
        self.assertEqual(parse(x,'Zoning'),[])
        x['features'][0]['properties']['access']='private'
        with self.assertRaisesRegex(ValueError,'identity'):parse(x,'Streetcar Stations')
    def test_queries_remain_catalog_only(self):
        r=make_request('Streetcar Stations');self.assertIn('/dataset/items?q=Streetcar+Stations&limit=3',r['url'])
        with self.assertRaises(ValueError):make_request('')
        with self.assertRaises(ValueError):make_request('x'*161)
