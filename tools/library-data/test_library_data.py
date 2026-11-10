import gzip, json, pathlib, tempfile, unittest
import library_data as ld
from enrich import parse, enrich

class DataTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);self.db=ld.connect(self.root/'index.sqlite')
  ld.seed(self.db,{'inventory':{'libraries':[{'libraryId':'koha:a','name':'A','country':'IN','connections':[{'connectionId':'primary','family':'koha','catalogUrl':'https://example.test'}]},{'libraryId':'calil:b','name':'B','country':'JP','connections':[{'connectionId':'primary','family':'calil'}]}]},'aliases':{'old:a':'koha:a'}})
 def tearDown(self):self.db.close();self.tmp.cleanup()
 def event(self,typ,**kw):
  e={'eventId':kw.pop('eventId',typ),'type':typ,'libraryId':'koha:a','at':'2026-11-10T00:00:00Z',**kw};ld.normalize(self.db,e,'events.jsonl',1,self.root);return e
 def test_all_countries_and_unchecked(self):
  self.assertEqual(self.db.execute('SELECT count(*) FROM libraries').fetchone()[0],2)
  self.assertEqual(self.db.execute("SELECT status FROM library_current WHERE country='JP'").fetchone()[0],'Not checked')
 def test_alias_and_idempotent_results(self):
  e=self.event('search_completed',libraryId='old:a',query='Test',records=[{'recordId':'1','title':'Test','edition':'2nd','authors':['A']},{'recordId':'2','title':'Test','edition':'3rd'}]);ld.normalize(self.db,e,'copy/events.jsonl',2,self.root)
  self.assertEqual(self.db.execute('SELECT count(*) FROM query_results').fetchone()[0],2)
  self.assertEqual(self.db.execute('SELECT count(*) FROM event_locations').fetchone()[0],2)
  self.assertEqual(self.db.execute('SELECT count(*) FROM catalog_records').fetchone()[0],2)
 def test_conflicting_id_rejected(self):
  self.event('search_completed',query='a');self.assertRaises(ValueError,self.event,'search_completed',query='b')
 def test_unknown_ids_quarantined(self):
  self.event('search_failed',libraryId='bad:id');self.assertEqual(self.db.execute('SELECT count(*) FROM unmapped_evidence').fetchone()[0],1)
 def test_native_never_app_eligible(self):
  self.event('fifty_library_outcome',outcome={'status':'Working','assessed':True,'distinctNativeBookRecords':21});self.assertEqual(self.db.execute('SELECT sum(app_eligible) FROM library_current').fetchone()[0],0)
 def test_old_success_does_not_mask_failure(self):
  self.event('fifty_library_outcome',outcome={'status':'Working'});self.event('triage_outcome',at='2026-11-11',outcome={'status':'Blocked/deferred'});self.assertEqual(self.db.execute("SELECT status FROM library_current WHERE library_id='koha:a'").fetchone()[0],'Blocked/deferred')
 def test_app_requires_current_fingerprint_and_live_evidence(self):
  p=self.root/'body.txt';p.write_bytes(b'ok');fp=self.db.execute("SELECT fingerprint FROM connections WHERE library_id='koha:a'").fetchone()[0]
  self.event('app_search_assessment',observationKind='live_http',relevantSpecificBook=True,correctLibraryScope=True,nativeRecordId='1',query='T',configurationFingerprint=fp,evidence=[{'path':'body.txt','sha256':ld.digest(b'ok')}])
  self.assertEqual(self.db.execute('SELECT sum(app_eligible) FROM library_current').fetchone()[0],1)
  self.db.execute("UPDATE connections SET fingerprint='changed'");self.assertEqual(self.db.execute('SELECT sum(app_eligible) FROM library_current').fetchone()[0],0)
 def test_replay_does_not_qualify_app(self):
  self.event('app_search_assessment',observationKind='saved_response_reanalysis',relevantSpecificBook=True,correctLibraryScope=True,nativeRecordId='1',query='T')
  self.assertEqual(self.db.execute('SELECT sum(app_eligible) FROM library_current').fetchone()[0],0)
 def test_invalidated_status_is_history_only(self):
  self.event('triage_outcome',outcome={'status':'Working'},eventId='first')
  self.event('triage_outcome',outcome={'status':'Blocked/deferred'},eventId='second',at='2026-11-11')
  self.event('revalidation_outcome_invalidated',sourceEventId='second',reason='bad detector')
  self.assertEqual(self.db.execute("SELECT status FROM library_current WHERE library_id='koha:a'").fetchone()[0],'Working')
  self.assertEqual(self.db.execute('SELECT count(*) FROM checks').fetchone()[0],2)
 def test_interrupted_check_does_not_replace_completed(self):
  self.event('triage_outcome',outcome={'status':'Working'})
  self.event('library_checkpoint',state='checking',at='2026-11-11')
  self.assertEqual(self.db.execute("SELECT status FROM library_current WHERE library_id='koha:a'").fetchone()[0],'Working')
 def test_empty_not_block_and_missing_metadata(self):
  self.event('search_completed',records=[]);self.event('book_accepted',book={'recordId':'1','title':'X'})
  self.assertEqual(self.db.execute('SELECT outcome FROM searches').fetchone()[0],'empty');self.assertIsNone(self.db.execute('SELECT edition FROM record_observations').fetchone()[0])
 def test_copies_and_fingerprints_separate(self):
  self.event('search_completed',records=[{'recordId':'1','barcode':'a','title':'T'},{'recordId':'2','nativeLookup':{'x':1},'title':'T'}])
  self.assertEqual({r[0] for r in self.db.execute('SELECT identity_kind FROM catalog_records')},{'copy','fingerprint'})
 def test_gzip_hashes_restore_and_crlf(self):
  raw=b'a\r\nb\r\n';p=self.root/'body.gz';p.write_bytes(gzip.compress(raw));ref={'sha256':ld.digest(raw),'storedSha256':ld.file_hash(p)}
  ld.evidence_file(self.db,p,self.root,ref);target=self.root/'restore.gz';ld.restore(self.db,self.root,ref['storedSha256'],target);self.assertEqual(p.read_bytes(),target.read_bytes())
  self.assertRaises(ValueError,ld.evidence_file,self.db,p,self.root,{'sha256':'bad'})
 def test_segments_and_partial_line_resume(self):
  p=self.root/'events.jsonl';p.write_text(json.dumps({'eventId':'one','type':'x'})+'\n{"partial":')
  ld.import_journal(self.db,p,self.root);self.assertEqual(self.db.execute('SELECT count(*) FROM events').fetchone()[0],1)
  with p.open('a') as f:f.write('true}\n')
  ld.import_journal(self.db,p,self.root);self.assertEqual(self.db.execute('SELECT count(*) FROM events').fetchone()[0],2)
  p.write_text('corrupted\n');self.assertRaises(ValueError,ld.import_journal,self.db,p,self.root)
 def test_sealed_hash_and_path_escape(self):
  p=self.root/'events.jsonl';p.write_text('{}\n');(self.root/'journal-index.json').write_text(json.dumps({'sealed':[{'path':'events.jsonl','sha256':'bad'}],'active':'events-1.jsonl'}));self.assertRaises(ValueError,ld.journals,self.root);self.assertRaises(ValueError,ld.safe,self.root,'../outside')
 def test_sealed_and_active_segments_are_both_imported(self):
  a=self.root/'events.jsonl';b=self.root/'events-1.jsonl'
  a.write_text(json.dumps({'eventId':'a','type':'x'})+'\n');b.write_text(json.dumps({'eventId':'b','type':'x'})+'\n')
  (self.root/'journal-index.json').write_text(json.dumps({'sealed':[{'path':a.name,'sha256':ld.file_hash(a),'bytes':a.stat().st_size}],'active':b.name}))
  for p in ld.journals(self.root):ld.import_journal(self.db,p,self.root)
  self.assertEqual(self.db.execute('SELECT count(*) FROM events').fetchone()[0],2)
 def test_missing_body_is_not_silently_ignored(self):
  self.assertRaises(FileNotFoundError,self.event,'search_completed',evidence=[{'path':'missing','sha256':'0'*64}])
 def test_same_native_id_in_different_libraries_is_not_merged(self):
  self.event('search_completed',records=[{'recordId':'1','title':'T'}])
  self.event('search_completed',eventId='other',libraryId='calil:b',records=[{'recordId':'1','title':'T'}])
  self.assertEqual(self.db.execute('SELECT count(*) FROM catalog_records').fetchone()[0],2)
 def test_labelled_metadata_requires_native_row(self):
  body='<input id="Repeater1_HiddenField1_0" value="123"><span id="Repeater1_Lbl_Title_0"><b>T</b></span><span id="Repeater1_Lbl_Authors_0"><b>By</b> Jane Doe</span><span id="Repeater1_Lbl_Edition_0">Edition: 2nd</span>'
  result=parse(body);self.assertEqual(result['123']['edition'],'2nd');self.assertEqual(json.loads(result['123']['authors_json']),['Jane Doe']);self.assertEqual(parse(body.replace('HiddenField1','Unknown')), {})
 def test_dedup_preserves_references(self):
  for name in ('a','b'):
   p=self.root/name;p.write_bytes(b'same');ld.evidence_file(self.db,p,self.root)
  self.assertEqual(self.db.execute('SELECT count(*) FROM evidence_objects').fetchone()[0],1);self.assertEqual(self.db.execute('SELECT count(*) FROM evidence_files').fetchone()[0],2)
if __name__=='__main__':unittest.main()
