import copy
import hashlib
import json
import unittest
from fdic_games_catalog import parse,search,assess,ENDPOINT

DATA=[{'id':21,'name':'Earn','games':[{'id':11,'name':'Your Income and Expenses','game_category_id':21,'url':'/moneysmart-games-20260730/YourIncomeAndExpenses/story.html','name_es':'Los ingresos y los gastos'}]}]

class FDICTests(unittest.TestCase):
    def test_native_identity_and_metadata_scope(self):
        row=parse(json.dumps(DATA).encode())[0]
        self.assertEqual(row['id'],'11');self.assertFalse(row['full_content_access_verified']);self.assertEqual(row['title_es'],'Los ingresos y los gastos')
    def test_title_id_empty_and_no_substring_matching(self):
        rows=parse(json.dumps(DATA).encode())
        for field,value in [('title','income expenses'),('id','11')]:self.assertEqual(search(rows,{'field':field,'value':value}),rows)
        for value in ['incom','zzzero'] :self.assertEqual(search(rows,{'field':'title','value':value}),[])
    def test_bad_identity_category_link_duplicate_and_html_fail(self):
        for field,value in [('id',True),('game_category_id',22),('name',''),('url','https://other.example/')]:
            data=copy.deepcopy(DATA);data[0]['games'][0][field]=value
            with self.assertRaises(ValueError):parse(json.dumps(data).encode())
        data=copy.deepcopy(DATA);data[0]['games']*=2
        for body in [json.dumps(data).encode(),b'<html>challenge</html>',b'[]']:
            with self.assertRaises(ValueError):parse(body)
    def test_no_verification_on_hash_status_or_truncation_error(self):
        body=json.dumps(DATA).encode();source={'id':'fdic-money-smart','query':{'adapter':'fdic-games-catalog'}}
        case={'id':'income','expected_ids':['11'],'request':{'method':'GET','url':ENDPOINT,'local_query':{'field':'title','value':'income'}}}
        cap={'http':{'status':200,'truncated':False,'sampled_bytes_sha256':hashlib.sha256(body).hexdigest()}}
        self.assertEqual(assess(source,case,cap,body)['verdict'],'verified')
        for field,value in [('status',403),('truncated',True),('sampled_bytes_sha256','wrong')]:
            broken=copy.deepcopy(cap);broken['http'][field]=value;self.assertEqual(assess(source,case,broken,body)['verdict'],'unverified')
