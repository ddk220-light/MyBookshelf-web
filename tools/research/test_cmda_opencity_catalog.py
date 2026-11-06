import hashlib
import unittest
from cmda_opencity_catalog import ENDPOINT,PACKAGE,parse,search,assess

ID='11111111-2222-3333-4444-555555555555'
SECOND='11111111-2222-3333-4444-666666666666'
TITLE='Chennai Master Plan 2026 - Volume 2 - Aquifer Recharge Areas Map'


def item(native=ID,title=TITLE,target=None):
    target=target or ENDPOINT+'/resource/'+native
    return f'<li class="resource-item" data-id="{native}"><a class="heading" href="{target}" title="{title}">Truncated...</a><ul><li><a class="resource-url-analytics" href="https://data.opencity.in/dataset/{PACKAGE}/resource/{native}/download/{native}.pdf">Download</a></li></ul></li>'


def page(items=None):
    return ('<html><a href="/organization/chennai-metropolitan-development-authority">CMDA</a><ul>'+(item() if items is None else items)+'</ul></html>').encode()


class CMDACatalogTests(unittest.TestCase):
    def test_preserves_full_label_and_explicit_index_identity(self):
        rows=parse(page())['records']
        self.assertEqual(rows[0]['title'],TITLE)
        self.assertEqual(rows[0]['id'],ID)
        self.assertIsNone(rows[0]['publisher_native_id'])
        self.assertFalse(rows[0]['reading_access_verified'])
        self.assertIn('OpenCity',rows[0]['identity_namespace'])

    def test_literal_title_and_empty_search(self):
        rows=parse(page())['records']
        self.assertEqual(search(rows,{'field':'title','value':'Aquifer Recharge'}),rows)
        self.assertEqual(search(rows,{'field':'title','value':'Aquif'}),[])
        self.assertEqual(search(rows,{'field':'title','value':'qzxnevermatch2026'}),[])
        self.assertEqual(search(rows,{'field':'id','value':ID}),rows)

    def test_conflicting_id_quarantined_no_title_merge(self):
        data=parse(page(item()+item(title=TITLE+' different')+item(native=SECOND)))
        self.assertEqual([x['id'] for x in data['records']],[SECOND])
        self.assertEqual(len(data['excluded']),2)

    def test_missing_attribution_incomplete_and_mismatched_links_fail(self):
        for data in [page()[:-7],page().replace(b'chennai-metropolitan-development-authority',b'other'),
                     page(item(target=ENDPOINT+'/resource/'+SECOND)),page(item(title='Chennai Master Plan 2026 - Volume 2 -...')),
                     page().replace(PACKAGE.encode(),SECOND.encode())]:
            with self.assertRaises(ValueError):parse(data)

    def test_capture_hash_and_denied_response_never_verify(self):
        source={'id':'cmda-planning','query':{'adapter':'cmda-opencity-catalog'}}
        case={'id':'aquifer','expected_ids':[ID],'request':{'method':'GET','url':ENDPOINT,'local_query':{'field':'title','value':'aquifer'}}}
        body=page();cap={'http':{'status':200,'truncated':False,'sampled_bytes_sha256':hashlib.sha256(body).hexdigest()}}
        self.assertEqual(assess(source,case,cap,body)['verdict'],'verified')
        cap['http']['sampled_bytes_sha256']='different'
        self.assertEqual(assess(source,case,cap,body)['verdict'],'unverified')
        cap['http']['status']=403
        self.assertEqual(assess(source,case,cap,body)['verdict'],'unverified')


if __name__=='__main__':unittest.main()
