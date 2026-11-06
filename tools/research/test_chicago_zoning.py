import copy
import json
import unittest
from urllib.parse import urlencode
from chicago_zoning import ENDPOINT,FIELDS,checked_query,parse


class ChicagoMetadataTests(unittest.TestCase):
    def record(self):return {'objectid':'2565586','globalid':'{2574772C-6E1C-4668-A8A0-055B2B80FCE4}',
        'zoning_id':'18','zone_class':'C1-3','edit_date':'2025-03-05T00:00:00.000'}

    def test_native_feature_identity_is_not_zoning_category_or_result_position(self):
        row=parse(json.dumps([self.record()]).encode(),'C1-3')[0]
        self.assertEqual(row['id'],'dj47-wfun/2574772c-6e1c-4668-a8a0-055b2b80fce4')
        self.assertEqual(row['zoning_id'],'18');self.assertTrue(row['title_is_generated_label'])
        self.assertFalse(row['geometry_requested']);self.assertFalse(row['personal_owner_fields_requested'])

    def test_foreign_fields_invalid_identity_and_wrong_class_fail(self):
        for change in [{'owner':'not allowed'},{'the_geom':{}},{'globalid':'1'},{'zone_class':'RM-5'},{'objectid':'-1'}]:
            with self.subTest(change=change),self.assertRaises(ValueError):parse(json.dumps([{**self.record(),**change}]).encode(),'C1-3')

    def test_duplicate_unordered_and_unbounded_pages_fail(self):
        r=self.record();second={**r,'objectid':'1','globalid':'{61EA7985-F78F-4B60-8ABE-D5046436846F}'}
        for rows in [[r,r],[r,second],[r,r,r],{'error':'query failed'}]:
            with self.subTest(rows=rows),self.assertRaises(ValueError):parse(json.dumps(rows).encode(),'C1-3')
        self.assertEqual(parse(b'[]','C1-3'),[])

    def test_request_whitelist_prevents_bulk_owner_and_arbitrary_predicates(self):
        p={'$select':FIELDS,'$where':"zone_class='C1-3'",'$limit':'2','$order':'objectid'}
        self.assertEqual(checked_query({'method':'GET','url':ENDPOINT+'?'+urlencode(p)}),'C1-3')
        for change in [{'$select':'*'},{'$limit':'10000'},{'$where':"zone_class='C1-3' OR 1=1"},{'$offset':'20'}]:
            with self.subTest(change=change),self.assertRaises(ValueError):checked_query({'method':'GET','url':ENDPOINT+'?'+urlencode({**p,**change})})


if __name__=='__main__':unittest.main()
