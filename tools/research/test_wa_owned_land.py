import copy
import json
import unittest
from unittest.mock import patch
import wa_owned_land as w


def req(where='PARCEL_TYPE_CD = 1 AND COUNTY_JURISDICT_DESG_CD = 17'):
    return {'method':'GET','url':w.BASE+'/query','params':{'f':'json','where':where,'outFields':','.join(w.FIELDS),'returnGeometry':'false','orderByFields':'PARCEL_SYST_ID ASC','resultOffset':0,'resultRecordCount':5}}


def page():
    a={'OBJECTID':3,'PARCEL_SYST_ID':51,'PARCEL_TYPE_CD':1,'GLOBALID':'{12345678-1234-1234-1234-123456789abc}','COUNTY_JURISDICT_DESG_CD':17,'SURFACE_RIGHTS_FLG':'Y','MINERAL_RIGHTS_FLG':'N','TIMBER_RIGHTS_FLG':None,'SURFACE_TRUST_CD':3,'EDIT_DATE':None,'EDIT_STATUS':1}
    return {'features':[{'attributes':a}]}


class OwnedLandTests(unittest.TestCase):
    def test_native_identity_preserves_unknown_rights(self):
        r=w.parse(page(),req())[0]
        self.assertEqual(r['id'],'51');self.assertIsNone(r['attributes']['TIMBER_RIGHTS_FLG'])
        self.assertFalse(r['current_title_certified'])
        self.assertEqual(w.parse({'features':[]},req('PARCEL_TYPE_CD = 1 AND 1 = 0')),[])

    def test_scope_cannot_expand_or_mutate(self):
        bad=[]
        for key,val in [('where','1=1'),('where','PARCEL_TYPE_CD = 3 AND PARCEL_SYST_ID = 51'),('where','PARCEL_TYPE_CD = 1 OR 1=1'),('outFields','*'),('returnGeometry','true'),('resultRecordCount',6),('resultOffset',11),('objectIds','51')]:
            r=req();r['params'][key]=val;bad.append(r)
        r=req();r['method']='POST';bad.append(r)
        r=req();r['url']=w.BASE+'/applyEdits';bad.append(r)
        with patch.object(w,'request') as network:
            for r in bad:
                with self.assertRaises(ValueError):w.capture(r,None,{})
            network.assert_not_called()

    def test_ignored_ownership_and_county_filters_fail(self):
        for key,val in [('PARCEL_TYPE_CD',3),('PARCEL_TYPE_CD',True),('COUNTY_JURISDICT_DESG_CD',18),('PARCEL_SYST_ID',True),('GLOBALID','invalid'),('SURFACE_RIGHTS_FLG','unknown')]:
            d=page();d['features'][0]['attributes'][key]=val
            with self.assertRaises(ValueError):w.parse(d,req())
        with self.assertRaises(ValueError):w.parse(page(),req('PARCEL_TYPE_CD = 1 AND PARCEL_SYST_ID = 52'))
        with self.assertRaises(ValueError):w.parse(page(),req('PARCEL_TYPE_CD = 1 AND 1 = 0'))

    def test_private_fields_geometry_and_duplicate_ids_fail(self):
        d=page();d['features'][0]['attributes']['TIMBER_OWNER_NM']='synthetic forbidden'
        d2=page();d2['features'][0]['geometry']={}
        d3=page();d3['features']*=2
        for obj in [d,d2,d3,{'error':{'code':400}}]:
            with self.assertRaises(ValueError):w.parse(obj,req())

    def test_private_values_never_saved_on_invalid_response(self):
        d=page();d['features'][0]['attributes']['EDIT_WHO']='synthetic forbidden value'
        with patch.object(w,'request',return_value=({'status':200,'truncated':False,'sampled_bytes_sha256':'a'*64},json.dumps(d).encode())),patch.object(w.time,'sleep'):
            r=w.capture(req(),None,{})
        self.assertEqual(r['outcome'],'invalid-response');self.assertNotIn('observed_output',r)
        self.assertNotIn('synthetic forbidden',json.dumps(r))

    def test_policy_denial_never_requests(self):
        with patch.object(w,'request') as network:
            r=w.capture(req(),False,{'status':403});network.assert_not_called()
        self.assertEqual(r['outcome'],'skipped')

    def test_timeout_truncation_rate_limit_not_empty_success(self):
        for status,truncated in [(None,False),(429,False),(503,False),(200,True)]:
            with patch.object(w,'request',return_value=({'status':status,'truncated':truncated,'sampled_bytes_sha256':'b'*64},b'')),patch.object(w.time,'sleep'):
                r=w.capture(req(),None,{})
            self.assertEqual(r['outcome'],'blocked-or-failed');self.assertNotIn('observed_output',r)

    def test_page_bound_and_sort_order_enforced(self):
        d=page();x=copy.deepcopy(d['features'][0]);x['attributes']['PARCEL_SYST_ID']=50;d['features'].append(x)
        with self.assertRaises(ValueError):w.parse(d,req())
        r=req();r['params']['resultRecordCount']=1
        with self.assertRaises(ValueError):w.parse(d,r)


if __name__=='__main__':unittest.main()
