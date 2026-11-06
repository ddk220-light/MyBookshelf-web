import json
import unittest
from unittest.mock import patch
import cleveland_catalog as c


def req():return {'method':'GET','url':c.BASE,'params':{'q':'lotus','cc0':'','has_image':1,'limit':3,'skip':0,'fields':','.join(c.FIELDS)}}

def page():return {'data':[{'id':123,'accession_number':'1950.1','title':'Lotus','title_in_original_language':None,'creation_date':'1800s','has_conservation_images':False,'share_license_status':'CC0','url':'https://www.clevelandart.org/art/1950.1','images':{'web':{'url':'https://images.clevelandart.org/1950.1_web.jpg'}}}]}


class ClevelandTests(unittest.TestCase):
    def test_native_identity_does_not_claim_image_access(self):
        r=c.parse(page(),req())[0];self.assertEqual(r['id'],'123');self.assertFalse(r['image_access_verified'])
        self.assertEqual(c.parse({'data':[]},req()),[])

    def test_omitted_original_language_is_not_invented_null_evidence(self):
        d=page();del d['data'][0]['title_in_original_language']
        r=c.parse(d,req())[0]
        self.assertEqual(r['omitted_optional_fields'],['title_in_original_language'])
        self.assertNotIn('title_in_original_language',r['metadata'])

    def test_cc0_metadata_does_not_override_item_copyright(self):
        d=page();d['data'][0]['share_license_status']='Copyright'
        with self.assertRaises(ValueError):c.parse(d,req())
        d=page();d['data'][0]['images']={}
        with self.assertRaises(ValueError):c.parse(d,req())

    def test_errors_duplicate_and_wrong_native_ids_fail(self):
        d=page();d['data']*=2
        for obj in [d,{'detail':'not found'},{'data':None}]:
            with self.assertRaises(ValueError):c.parse(obj,req())
        r=req();r['url']=c.BASE+'124';r['params']={'fields':','.join(c.FIELDS)}
        with self.assertRaises(ValueError):c.parse(page(),r)

    def test_request_cannot_upload_or_expand_scope(self):
        bad=[]
        for k,v in [('limit',1000),('fields','*'),('cc0','false'),('skip',1000),('images','download')]:
            r=req();r['params'][k]=v;bad.append(r)
        r=req();r['method']='POST';bad.append(r)
        r=req();r['url']='https://images.clevelandart.org/file.jpg';bad.append(r)
        with patch.object(c,'request') as network:
            for r in bad:
                with self.assertRaises(ValueError):c.capture(r,None,{})
            network.assert_not_called()

    def test_policy_failure_never_requests(self):
        with patch.object(c,'request') as network:
            r=c.capture(req(),False,{});network.assert_not_called()
        self.assertEqual(r['outcome'],'skipped')

    def test_bad_payload_and_truncation_not_counted(self):
        h={'status':200,'truncated':False,'sampled_bytes_sha256':'a'*64};d=page();d['data'][0]['share_license_status']='Copyright'
        with patch.object(c,'request',return_value=(h,json.dumps(d).encode())),patch.object(c.time,'sleep'):
            r=c.capture(req(),None,{})
        self.assertEqual(r['outcome'],'invalid-response');self.assertNotIn('observed_output',r)
        h['truncated']=True
        with patch.object(c,'request',return_value=(h,b'{}')),patch.object(c.time,'sleep'):
            self.assertEqual(c.capture(req(),None,{})['outcome'],'blocked-or-failed')


if __name__=='__main__':unittest.main()
