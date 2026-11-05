import json
import unittest
from unittest.mock import patch
import plss_catalog as p


def req():
    return {'method':'GET','url':p.BASE+'/query','params':{'f':'json','where':"STATEABBR = 'AZ'",'outFields':','.join(p.FIELDS),'returnGeometry':'false','orderByFields':'OBJECTID ASC','resultOffset':0,'resultRecordCount':5}}


def page():
    a={k:None for k in p.FIELDS};a.update(OBJECTID=7,STATEABBR='AZ',PLSSID='AZ140010N0010E0',TWNSHPLAB='T1N R1E',GlobalID='{11111111-2222-3333-4444-555555555555}')
    return {'features':[{'attributes':a}]}


class PlssCatalogTests(unittest.TestCase):
    def test_grid_reference_is_not_a_personal_ownership_record(self):
        row=p.parse(page(),req())[0]
        self.assertFalse(row['ownership_verified']);self.assertFalse(row['legal_boundary_verified'])
        self.assertIsNone(row['attributes']['SOURCEDATE'])

    def test_personal_editor_or_geometry_fields_rejected(self):
        for key in ['created_user','last_edited_user','OWNER','SOURCEREF']:
            data=page();data['features'][0]['attributes'][key]='fixture'
            with self.assertRaises(ValueError):p.parse(data,req())
        data=page();data['features'][0]['geometry']={}
        with self.assertRaises(ValueError):p.parse(data,req())

    def test_wrong_state_native_id_duplicates_and_errors_fail(self):
        for field,value in [('STATEABBR','CA'),('GlobalID','bad'),('OBJECTID',True),('SOURCEDATE','yesterday')]:
            data=page();data['features'][0]['attributes'][field]=value
            with self.assertRaises(ValueError):p.parse(data,req())
        data=page();data['features']*=2
        with self.assertRaises(ValueError):p.parse(data,req())
        with self.assertRaises(ValueError):p.parse({'error':{'code':400}},req())
        self.assertEqual(p.parse({'features':[]},req()),[])

    def test_no_edits_other_layers_bulk_queries_or_sql_injection(self):
        requests=[]
        for key,value in [('outFields','*'),('where',"STATEABBR = 'AZ' OR 1=1"),('resultRecordCount',2000),('returnGeometry','true')]:
            r=req();r['params'][key]=value;requests.append(r)
        r=req();r['url']=r['url'].replace('/1/query','/3/query');requests.append(r)
        r=req();r['method']='POST';requests.append(r)
        with patch.object(p,'request') as network:
            for r in requests:
                with self.assertRaises(ValueError):p.capture(r,None,{})
            network.assert_not_called()

    def test_policy_denial_never_requests_target(self):
        with patch.object(p,'request') as network:r=p.capture(req(),False,{'status':403})
        network.assert_not_called();self.assertEqual(r['outcome'],'skipped')

    def test_transport_and_truncation_are_failures_not_empty_catalogs(self):
        for status,truncated in [(429,False),(503,False),(None,False),(200,True)]:
            with patch.object(p,'request',return_value=({'status':status,'truncated':truncated,'sampled_bytes_sha256':'a'*64},b'{}')),patch.object(p.time,'sleep'):
                r=p.capture(req(),None,{})
            self.assertEqual(r['outcome'],'blocked-or-failed');self.assertNotIn('observed_output',r)


    def test_capture_omits_unexpected_personal_values(self):
        data=page();data['features'][0]['attributes']['OWNER']='synthetic forbidden value'
        http={'status':200,'truncated':False,'sampled_bytes_sha256':'a'*64}
        with patch.object(p,'request',return_value=(http,json.dumps(data).encode())),patch.object(p.time,'sleep'):
            result=p.capture(req(),None,{})
        self.assertEqual(result['outcome'],'invalid-response')
        self.assertNotIn('observed_output',result)
        self.assertNotIn('synthetic forbidden value',json.dumps(result))


if __name__=='__main__':unittest.main()
