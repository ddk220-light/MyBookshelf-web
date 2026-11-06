import hashlib
import unittest
from bhuvan_catalog import parse as products, assess, ENDPOINT, PRODUCT
from nyc_zoning_metadata import parse as zoning, make_request, validate_request
from metadata_links import local_search

class RecoveredMaps(unittest.TestCase):
    def catalog(self):
        def row(p,t):
            return '<tr><td>1</td><td><a href="'+PRODUCT+'?c=s&amp;s=C1&amp;p='+p+'">'+t+'</a></td><td>32m</td><td>2006</td><td>2014</td><td>Single</td><td>India</td><td>8MB</td></tr>'
        return ('<html>Bhuvan NOEDA Data Products<table>'+row('cdv1','DEM Version 1')+row('cdv2','DEM Version 2')+'</table></html>').encode()
    def test_product_versions_and_negative_search(self):
        rows=products(self.catalog());self.assertEqual(len(rows),2)
        self.assertNotEqual(rows[0]['id'],rows[1]['id'])
        self.assertEqual(rows[0]['availability_latest'],'2014')
        self.assertEqual(len(local_search(rows,{'field':'title','value':'Version 2'})),1)
        self.assertEqual(local_search(rows,{'field':'title','value':'unrelated'}),[])
        self.assertFalse(rows[0]['reading_access_verified'])
    def test_changed_catalog_and_conflicting_id_rejected(self):
        for body in [self.catalog().replace(b'</html>',b''),self.catalog().replace(b'NOEDA',b'Other'),self.catalog().replace(b'p=cdv2',b'p=cdv1')]:
            with self.assertRaises(ValueError):products(body)
    def test_mismatched_capture_never_verifies(self):
        body=self.catalog();sid=products(body)[0]['id']
        source={'id':'bhuvan','query':{'adapter':'bhuvan-product-catalog'}}
        case={'id':'v1','request':{'method':'GET','url':ENDPOINT,'local_query':{'field':'title','value':'Version 1'}},'expected_ids':[sid]}
        result=assess(source,case,{'http':{'status':200,'truncated':False,'sampled_bytes_sha256':'wrong'}},body)
        self.assertEqual(result['verdict'],'unverified')
    def test_zoning_preserves_native_id_and_checks_relevance(self):
        row={':id':'row-9bfa~5kui_bka5','zoning_map':'10A','quartersec':'A','section':'10'}
        self.assertEqual(zoning([row],'10A')[0]['id'],row[':id'])
        self.assertEqual(zoning([],'10A'),[])
        for data in [[{**row,'owner':'unexpected'}],[row,row],[{**row,'zoning_map':'11A'}]]:
            with self.assertRaises(ValueError):zoning(data,'10A')
    def test_only_reviewed_nonpersonal_requests(self):
        self.assertEqual(validate_request(make_request('10A')),'10A')
        r=make_request('10A');r['params']['$select']='*'
        with self.assertRaises(ValueError):validate_request(r)
        for label in ["1A' OR true",'','homeowner']:
            with self.assertRaises(ValueError):make_request(label)
        with self.assertRaises(ValueError):make_request('10A',200)
