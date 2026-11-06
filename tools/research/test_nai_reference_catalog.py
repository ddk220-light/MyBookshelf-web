import hashlib
import unittest
from unittest.mock import patch
from nai_reference_catalog import ENDPOINT, parse, search, assess, probe


def row(native='RT_000000000001', title='Guide to Railway Records, Vol II', target=None, legacy='1'):
    target = target or 'https://www.abhilekh-patal.in/Category/Search/QuerySearch?query='+native
    return f'<tr><th>{title}</th><td><a href="{target}">https://www.abhilekh-patal.in/jspui/handle/123456789/{legacy}</a><b>{native}</b></td></tr>'


def page(rows):
    return ('<html><table>'+rows+'</table></html>').encode()


class NAIMetadataTests(unittest.TestCase):
    def test_preserves_native_identity_and_versions_without_reader_claim(self):
        item=parse(page(row()))['records'][0]
        self.assertEqual(item['id'],'RT_000000000001')
        self.assertIn('Vol II',item['title'])
        self.assertFalse(item['reading_access_verified'])
        self.assertEqual(search([item],{'field':'title','value':'Railway Guide'}),[item])
        self.assertEqual(search([item],{'field':'id','value':item['id']}),[item])
        self.assertEqual(search([item],{'field':'title','value':'rail'}),[])

    def test_duplicate_targets_quarantined_instead_of_merging_volumes(self):
        target='https://www.abhilekh-patal.in/Category/ItemDetails/ItemDetails?itemId=11111111-2222-3333-4444-555555555555'
        data=parse(page(row()+row('RT_000000000002','Volume V',target,'2')+row('RT_000000000003','Volume VI',target,'3')))
        self.assertEqual(len(data['records']),1)
        self.assertEqual(len(data['excluded']),2)

    def test_unpublished_heading_and_mismatched_ids_are_not_records(self):
        data=parse(page(row()+'<tr><th colspan="2">Not yet published</th></tr>'+row('RT_000000000002','Bad','https://example.com/item','2')))
        self.assertEqual(len(data['records']),1)
        self.assertEqual(len(data['excluded']),1)
        with self.assertRaises(ValueError):parse(page(row(target='https://www.abhilekh-patal.in/Category/Search/QuerySearch?query=RT_000000000002')))

    def test_invalid_query_incomplete_and_missing_metadata_fail(self):
        for q in [{'field':'body','value':'x'},{'field':'title','value':'---'},{'field':'id','value':''}]:
            with self.assertRaises(ValueError):search([],q)
        for body in [b'<html>Login</html>',page(row())[:-7],b'x'*(512*1024+1)]:
            with self.assertRaises(ValueError):parse(body)

    def test_wrong_hash_and_error_page_do_not_pass(self):
        body=page(row());source={'id':'abhilekh-patal','query':{'adapter':'nai-reference-table'}}
        case={'id':'title','expected_ids':['RT_000000000001'],'request':{'method':'GET','url':ENDPOINT,'local_query':{'field':'title','value':'railway'}}}
        cap={'http':{'status':200,'truncated':False,'sampled_bytes_sha256':hashlib.sha256(body).hexdigest()}}
        self.assertEqual(assess(source,case,cap,body)['verdict'],'verified')
        self.assertEqual(assess(source,case,cap,body+b' ')['verdict'],'unverified')
        cap['http']['status']=403
        self.assertEqual(assess(source,case,cap,body)['verdict'],'unverified')

    def test_denied_policy_prevents_catalog_request(self):
        source={'id':'abhilekh-patal','query':{'endpoint':ENDPOINT,'cases':[]}}
        with patch('nai_reference_catalog.fcntl.flock'),patch('nai_reference_catalog.robots',return_value=(False,{'status':403})),patch('nai_reference_catalog.request') as request:
            probe(source)
            request.assert_not_called()


if __name__=='__main__':unittest.main()
