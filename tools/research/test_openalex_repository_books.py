import unittest
from copy import deepcopy
from openalex_repository_books import ENDPOINT, SELECT, SOURCES, validate_request, normalize, assess, budget_ok


def item(native='oai:doab-books:123', **updates):
    return {'id':'pmh:'+native,'native_id':native,'title':'Equidade e saúde: contribuições da epidemiologia',
            'source_id':'https://openalex.org/S4306400539','native_id_namespace':'pmh',
            'work_id':'https://openalex.org/W123','provenance':'repo','type':'book','is_oa':True,
            'landing_page_url':'https://www.doabooks.org/doab?func=search&amp;query=rid:123',
            'version':'submittedVersion','license':'cc-by-nc-nd','language':'pt',**updates}


def request(sid='doab', **updates):
    return {'method':'GET','url':ENDPOINT,'params':{'filter':'source_id:'+SOURCES[sid]+',type:book,is_oa:true',
            'search':'Equidade saúde','select':SELECT,'per_page':5,'page':1,**updates}}


class RepositoryBooksTests(unittest.TestCase):
    def test_native_catalog_and_aggregator_identity_remain_separate(self):
        rows, excluded = normalize('doab',{'results':[item()]},'Equidade saúde')
        self.assertEqual(rows[0]['id'],'oai:doab-books:123')
        self.assertEqual(rows[0]['openalex_work_id'],'https://openalex.org/W123')
        self.assertEqual(rows[0]['reported_version'],'submittedVersion')
        self.assertEqual(rows[0]['reported_license'],'cc-by-nc-nd')
        self.assertIn('&query=',rows[0]['landing_page'])
        self.assertIn('&amp;query=',rows[0]['published_landing_page'])
        self.assertFalse(rows[0]['reading_access_verified'])
        self.assertEqual(excluded,[])

    def test_wrong_repository_nonbook_and_oa_false_excluded(self):
        for delta in [{'source_id':'https://openalex.org/S999'}, {'native_id':'https://openalex.org/W123'},
                      {'native_id_namespace':'doi'},{'provenance':'crossref'},{'is_oa':False},
                      {'type':'article'},{'id':'pmh:oai:doab-books:999'}]:
            rows,excluded=normalize('doab',{'results':[item(**delta)]},'saúde')
            self.assertEqual(rows,[])
            self.assertEqual(len(excluded),1)

    def test_relevance_is_literal_unicode_title_tokens(self):
        self.assertTrue(normalize('doab',{'results':[item()]},'SAÚDE epidemiologia')[0])
        self.assertFalse(normalize('doab',{'results':[item()]},'epidemio')[0])
        self.assertFalse(normalize('doab',{'results':[item()]},'qzxnevermatch2026')[0])

    def test_distinct_native_versions_of_same_work_not_merged(self):
        a=item(native='oai:oapen:100',source_id='https://openalex.org/S4306402535')
        b=item(native='oai:oapen:101',source_id='https://openalex.org/S4306402535')
        rows,_=normalize('oapen',{'results':[a,b]},'saúde')
        self.assertEqual(len(rows),2)
        self.assertEqual(len({r['openalex_work_id'] for r in rows}),1)
        with self.assertRaises(ValueError):normalize('oapen',{'results':[a,a]},'saúde')

    def test_new_oapen_handle_is_preserved_and_unsafe_link_rejected(self):
        x=item(native='oai:library.oapen.org:20.500.12657/123',source_id='https://openalex.org/S4306402535')
        self.assertEqual(normalize('oapen',{'results':[x]},'saúde')[0][0]['id'],x['native_id'])
        for link in ['javascript:alert(1)','https://user:pass@example.com/x','https://example.com/\nfoo']:
            self.assertFalse(normalize('doab',{'results':[item(landing_page_url=link)]},'saúde')[0])

    def test_requests_cannot_expand_to_unreviewed_sources_or_content(self):
        validate_request('doab',request())
        for req in [request(filter='type:book'),request(per_page=100),request(page=3),request(search=''),
                    {**request(),'url':'https://api.openalex.org/content'}, {**request(),'headers':{'Authorization':'secret'}}]:
            with self.assertRaises(ValueError):validate_request('doab',req)

    def test_unknown_or_paid_allowance_prevents_search(self):
        b={'rate_limit':{'endpoint_costs_usd':{'search':0.001},'daily_remaining_usd':1,'prepaid_balance_usd':0}}
        self.assertTrue(budget_ok(b,10))
        for key,value in [('daily_remaining_usd',0.001),('prepaid_balance_usd',5)]:
            changed=deepcopy(b);changed['rate_limit'][key]=value;self.assertFalse(budget_ok(changed,10))
        self.assertFalse(budget_ok({},10))

    def test_error_response_never_counted_as_working(self):
        source={'id':'doab','query':{'adapter':'openalex-repository-books'}}
        case={'id':'x','request':request(),'expected_ids':['oai:doab-books:123']}
        cap={'http':{'status':503,'truncated':False}}
        self.assertEqual(assess(source,case,cap,{'results':[item()]})['verdict'],'unverified')
        cap['http']['status']=200
        self.assertEqual(assess(source,case,cap,{'results':[item()]})['verdict'],'verified')


if __name__=='__main__':unittest.main()
