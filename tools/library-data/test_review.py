import contextlib
import hashlib
import http.client
import json
import pathlib
import sqlite3
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
import library_data as ld
from enrich import enrich
from migrations import retain_connection
from registry import refresh, export_registry, connection_proposals
from review import open_readonly, normalize_params, page, dispatch, handler_for, csv_value, ensure_fresh_snapshot


class ReviewTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);self.path=self.root/'db.sqlite';self.db=ld.connect(self.path)
        self.snapshot={'inventory':{'libraries':[
            {'libraryId':'koha:a','name':'Library A','country':'IN','connections':[{'connectionId':'primary','family':'koha','mode':'native_http','fields':['title'],'catalogUrl':'https://catalog.test/'}]},
            {'libraryId':'calil:b','name':'Library B','country':'JP','connections':[{'connectionId':'primary','family':'calil','mode':'unsupported'}]}]},
            'aliases':{'old:a':'koha:a'},'runtime':[{'libraryId':'koha:a','connectionId':'primary','methods':['searchCatalog','resolveCatalogRecord'],'publicCapabilities':{'titleSearch':True},'implementationFingerprint':'code-v1'}]}
        ld.seed(self.db,self.snapshot)
        self.body=self.root/'response.txt';self.body.write_bytes(b'original\r\nevidence')
        self.ref={'path':'response.txt','sha256':ld.file_hash(self.body)}
        self.event('search_completed','q1',query='A title',field='title',wallMs=12,records=[{'recordId':'1','title':'A title','edition':'2nd','authors':['Writer'],'relevant':True},{'recordId':'2','title':'Other','relevant':False},{'recordId':'3','title':'A title','edition':'3rd'}])
        self.event('search_completed','q2',query='Another title',at='2026-11-11T00:00:00Z',records=[{'recordId':'1','title':'A title','edition':'2nd'}])
        self.event('search_completed','empty',query='Missing',records=[])
        self.event('search_failed','failed',query='Trouble',error='HTTP_TIMEOUT')
        self.event('book_accepted','accepted',book={'recordId':'1','title':'A title','edition':'2nd'})
        self.event('fifty_library_outcome','working',outcome={'status':'Working','assessed':True})
        enrich(self.db,self.root);refresh(self.db)
    def tearDown(self):self.db.close();self.tmp.cleanup()
    def event(self,typ,eid,**kwargs):
        ld.normalize(self.db,{'eventId':eid,'type':typ,'libraryId':'koha:a','at':'2026-11-10T00:00:00Z','evidence':[self.ref],**kwargs},'events.jsonl',1,self.root)
    def params(self,**kwargs):return normalize_params(kwargs)
    def prepare(self):self.db.commit();return refresh(self.db)
    def test_migration_idempotent_and_config_immutable(self):
        before=self.db.execute('SELECT config_json FROM connection_versions ORDER BY id').fetchall()
        self.db.commit();other=ld.connect(self.path);other.commit();other.close()
        self.assertEqual(len(before),self.db.execute('SELECT count(*) FROM connection_versions').fetchone()[0])
        self.assertRaises(sqlite3.IntegrityError,self.db.execute,"UPDATE connection_versions SET label='changed'")
    def test_reseed_preserves_previous_version_and_observations(self):
        counts=self.db.execute('SELECT count(*) FROM events').fetchone()[0]
        self.snapshot['inventory']['libraries'][0]['connections'][0]['catalogUrl']='https://new.test/'
        ld.seed(self.db,self.snapshot);self.prepare()
        self.assertEqual(self.db.execute("SELECT count(*) FROM connection_versions WHERE library_id='koha:a'").fetchone()[0],2)
        self.assertEqual(self.db.execute('SELECT count(*) FROM events').fetchone()[0],counts)
    def test_registry_determinism_and_no_native_promotion(self):
        out=self.root/'registry';first=export_registry(self.db,out)
        second=export_registry(self.db,out)
        self.assertEqual(first,second);self.assertEqual(first['libraries'],2);self.assertEqual(first['eligible'],0)
        registry=json.loads((out/'library-registry.json').read_text());self.assertEqual(registry['aliases']['old:a'],'koha:a')
        self.assertEqual(registry['libraries'][0]['status'],'Not checked')
    def test_later_native_failure_does_not_hide_last_success(self):
        self.event('triage_outcome','later',at='2026-11-12T00:00:00Z',outcome={'status':'Blocked/deferred'})
        self.prepare();row=page(self.db,'libraries',self.params(library='koha:a'))['rows'][0]
        self.assertEqual(row['status'],'Blocked/deferred');self.assertEqual(row['last_successful_check'],'2026-11-10T00:00:00Z')
    def app(self,eid='app',**kwargs):
        fp=self.db.execute("SELECT fingerprint FROM connections WHERE library_id='koha:a'").fetchone()[0]
        values=dict(query='A title',nativeRecordId='1',relevantSpecificBook=True,correctLibraryScope=True,configurationFingerprint=fp,appImplementationFingerprint='code-v1',observationKind='live_http');values.update(kwargs)
        self.event('app_search_assessment',eid,**values);self.prepare()
    def test_app_requires_both_configuration_and_implementation(self):
        self.app();self.assertTrue(connection_proposals(self.db)['koha:a'][0]['eligible'])
        self.app('changed',at='2026-11-12',appImplementationFingerprint='old-code')
        self.assertFalse(connection_proposals(self.db)['koha:a'][0]['eligible'])
    def test_new_failure_and_new_configuration_revoke_proposal(self):
        self.app();self.app('later',at='2026-11-12',ok=False,error='TIMEOUT')
        self.assertFalse(connection_proposals(self.db)['koha:a'][0]['eligible'])
        self.assertIsNotNone(connection_proposals(self.db)['koha:a'][0]['lastSuccessfulAppAssessment'])
    def test_replay_fixture_and_interruption_never_grant_app_pass(self):
        for kind in ('fixture','saved_response_reanalysis'):
            self.app(kind,observationKind=kind)
        self.app('interrupted',interrupted=True)
        self.assertFalse(connection_proposals(self.db)['koha:a'][0]['eligible'])
    def test_exact_term_filter_and_result_order(self):
        data=page(self.db,'results',self.params(query='A title'))
        self.assertEqual([r['rank'] for r in data['rows']],[1,2,3]);self.assertEqual([r['relevant'] for r in data['rows']],[1,0,None])
        self.assertEqual(page(self.db,'results',self.params(query='A%'))['total'],0)
    def test_books_filter_is_record_specific_and_editions_separate(self):
        data=page(self.db,'books',self.params(query='Another title'))
        self.assertEqual(data['total'],1);self.assertEqual(data['rows'][0]['native_id'],'1')
        all_books=page(self.db,'books',self.params())['rows'];self.assertEqual(len(all_books),3)
        self.assertEqual({r['edition'] for r in all_books},{'2nd','3rd',None})
    def test_duplicate_queries_keep_observations_not_extra_books(self):
        self.event('search_completed','repeat',query='A title',records=[{'recordId':'1','title':'A title'}]);self.prepare()
        self.assertEqual(page(self.db,'books',self.params())['total'],3)
        book=page(self.db,'books',self.params(record=ld.digest(ld.js(['koha:a','primary','native_bibliographic','1']).encode())))['rows'][0]
        self.assertEqual(book['observation_count'],4)
    def test_copy_identity_is_separate_from_bibliographic_id(self):
        self.event('search_completed','copies',query='Copy',records=[{'recordId':'bib','barcode':'copy-1','title':'Same'},{'recordId':'bib','barcode':'copy-2','title':'Same'}]);self.prepare()
        copies=page(self.db,'books',self.params(query='Copy'))['rows']
        self.assertEqual({r['native_id'] for r in copies},{'copy-1','copy-2'});self.assertTrue(all(r['identity_kind']=='copy' for r in copies))
    def test_historical_configuration_unknown_not_current_backfill(self):
        detail=dispatch(self.db,'/api/searches/q1',self.params())
        self.assertIsNone(detail['connectionVersion']);self.assertFalse(detail['search']['historical_configuration_known'])
        self.assertEqual(detail['evidence'][0]['raw_sha256'],self.ref['sha256'])
    def test_summary_reconciles_filters_and_unknown_relevance(self):
        summary=dispatch(self.db,'/api/summary',self.params(country='JP'))
        self.assertEqual(summary['libraries'],2);self.assertEqual(summary['filteredSearches']['observations'],0)
        self.assertEqual(summary['metrics']['returned_candidates'],4)
        self.assertEqual(summary['metrics']['unassessed_candidates'],2)
    def test_dates_and_pagination(self):
        data=page(self.db,'searches',self.params(since='2026-11-11',until='2026-11-11T23:59:59Z',limit='1'))
        self.assertEqual(data['total'],1);self.assertEqual(data['rows'][0]['id'],'q2')
        first=page(self.db,'results',self.params(limit='2'));second=page(self.db,'results',self.params(limit='2',offset='2'))
        self.assertEqual(len({r['observation_id'] for r in first['rows']+second['rows']}),4)
    def test_readonly_and_parameter_validation(self):
        with open_readonly(self.path) as ro:self.assertRaises(sqlite3.OperationalError,ro.execute,'DELETE FROM events')
        for args in [{'sql':'DELETE'},{'limit':'100000'},{'offset':'-1'},{'since':'not-date'},{'country':['IN','JP']}]:self.assertRaises(ValueError,normalize_params,args)
        self.assertEqual(page(self.db,'searches',self.params(query="' OR 1=1 --"))['total'],0)
    def test_stale_import_summary_is_rejected(self):
        ensure_fresh_snapshot(self.db)
        self.db.execute("INSERT INTO sources VALUES('new/events.jsonl',2,2,'changed','journal')")
        self.assertRaises(ValueError,ensure_fresh_snapshot,self.db)
    def test_link_checks_are_item_specific(self):
        self.event('search_completed','urls',query='URLs',records=[{'recordId':'x','title':'X','itemUrl':'https://catalog.test/x'},{'recordId':'y','title':'Y','itemUrl':'https://catalog.test/y'}])
        self.event('link_verification_outcome','link-x',url='https://catalog.test/x',tested=True,identityConfirmed=True,outcome='identity_confirmed');self.prepare()
        result=page(self.db,'results',self.params(query='URLs'))['rows'];self.assertEqual([r['link_status'] for r in result],['identity_confirmed','unchecked'])
    def test_csv_formula_protection_preserves_json(self):
        self.assertEqual(csv_value('=HYPERLINK("bad")'),"'=HYPERLINK(\"bad\")")
        self.event('search_completed','formula',query='=sum(1)',records=[]);self.prepare()
        self.assertEqual(page(self.db,'searches',self.params(query='=sum(1)'))['rows'][0]['query'],'=sum(1)')
    def test_http_loopback_privacy_and_filtered_csv(self):
        self.db.commit();server=ThreadingHTTPServer(('127.0.0.1',0),handler_for(self.path));thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            def request(path,method='GET',headers=None):
                conn=http.client.HTTPConnection('127.0.0.1',server.server_port);conn.request(method,path,headers=headers or {});r=conn.getresponse();body=r.read();status=r.status;conn.close();return status,body
            status,body=request('/api/searches?query=A%20title');self.assertEqual(status,200);self.assertEqual(json.loads(body)['total'],1)
            status,body=request('/api/export/results.csv?search=q1');self.assertEqual(status,200);self.assertEqual(len(list(__import__('csv').DictReader(io.StringIO(body.decode())))),3)
            self.assertEqual(request('/api/summary',headers={'Host':'attacker.test'})[0],403)
            self.assertEqual(request('/api/summary',headers={'Origin':'https://attacker.test'})[0],403)
            self.assertEqual(request('/api/searches','POST')[0],405)
            self.assertEqual(request('/../schema.sql')[0],404)
        finally:server.shutdown();server.server_close();thread.join()


import io
if __name__=='__main__':unittest.main()
