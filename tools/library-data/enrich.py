"""Recover explicitly labelled metadata from saved e-Granthalaya responses only."""
import gzip, html, json, re
from library_data import js, now, safe
VERSION='egranthalaya-labelled-spans-1'
SPAN=re.compile(r'<span\b[^>]*\bid="Repeater1_(Lbl_[A-Za-z_]+|ISBNLbl)_(\d+)"[^>]*>(.*?)</span\s*>',re.S|re.I)
ROW=re.compile(r'<input\b[^>]*id="Repeater1_HiddenField1_(\d+)"[^>]*value="(\d+)"[^>]*>',re.I)
def text(s):return ' '.join(html.unescape(re.sub('<[^>]*>',' ',s)).split())
def parse(body):
 rows={i:{'nativeId':n} for i,n in ROW.findall(body)}
 for field,i,value in SPAN.findall(body):
  if i in rows:rows[i][field]=text(value)
 result={}
 for r in rows.values():
  title=r.get('Lbl_Title')
  if not title:continue
  author=re.sub(r'^By\s+','',r.get('Lbl_Authors',''),flags=re.I) or None
  edition=re.sub(r'^Edition\s*:\s*','',r.get('Lbl_Edition',''),flags=re.I) or None
  language=re.sub(r'^Published In\s*:\s*','',r.get('Lbl_Lang',''),flags=re.I) or None
  imprint=re.sub(r'^Published By\s*:\s*','',r.get('Lbl_Imprint',''),flags=re.I)
  parts=imprint.split(';');year=parts[-1].strip() if re.fullmatch(r'\s*\d{4}\s*',parts[-1]) else None
  publisher=parts[0].strip() or None
  result[r['nativeId']]={'title':title,'authors_json':js([author]) if author else None,'edition':edition,'language':language,'publisher':publisher,'publication_year':year,'fields_json':js(r)}
 return result

def enrich(db,root):
 db.executescript('''CREATE TABLE IF NOT EXISTS metadata_extraction_runs(search_id TEXT PRIMARY KEY,version TEXT);
 CREATE TABLE IF NOT EXISTS metadata_extractions(observation_id TEXT PRIMARY KEY REFERENCES record_observations(id),source_path TEXT,source_sha256 TEXT,title TEXT,authors_json TEXT,edition TEXT,language TEXT,publisher TEXT,publication_year TEXT,fields_json TEXT,extraction_version TEXT,analysis_at TEXT);
 CREATE VIEW IF NOT EXISTS enriched_observations AS SELECT o.*,m.authors_json recovered_authors_json,m.edition recovered_edition,m.language recovered_language,m.publisher recovered_publisher,m.publication_year recovered_publication_year,m.source_path metadata_source,m.source_sha256 metadata_source_sha256,m.extraction_version metadata_extraction_version,m.analysis_at metadata_analysis_at FROM record_observations o LEFT JOIN metadata_extractions m ON m.observation_id=o.id;
 CREATE VIEW IF NOT EXISTS enriched_books AS SELECT b.*,m.authors_json recovered_authors_json,m.edition recovered_edition,m.language recovered_language,m.publisher recovered_publisher,m.publication_year recovered_publication_year,m.source_path metadata_source,m.source_sha256 metadata_source_sha256 FROM library_books b LEFT JOIN metadata_extractions m ON m.observation_id=b.id;
 CREATE VIEW IF NOT EXISTS enriched_results AS SELECT r.*,m.authors_json recovered_authors_json,m.edition recovered_edition,m.language recovered_language,m.publisher recovered_publisher,m.publication_year recovered_publication_year,m.source_path metadata_source,m.source_sha256 metadata_source_sha256 FROM returned_results r LEFT JOIN metadata_extractions m ON m.observation_id=r.id;
 ''')
 n=0
 searches=db.execute("SELECT e.id,e.source,e.raw_json FROM events e JOIN searches s ON s.id=e.id WHERE e.type='batch_query_outcome' AND s.returned>0 AND NOT EXISTS(SELECT 1 FROM metadata_extraction_runs m WHERE m.search_id=e.id AND m.version='egranthalaya-labelled-spans-1') ORDER BY e.source,e.line")
 for e in searches:
  # Each search response has its own member-scoped native IDs; never share rows across libraries.
  event=json.loads(e['raw_json']);refs=event.get('evidence') or []
  rows={};source=None
  for ref in reversed(refs):
   p=safe(root,(__import__('pathlib').Path(e['source']).parent/ref['path']))
   body=gzip.open(p,'rt',encoding='utf-8',errors='replace').read() if p.suffix=='.gz' else p.read_text(errors='replace')
   rows=parse(body)
   if rows:source=(str(p.relative_to(root)),ref['sha256']);break
  if not source:
   db.execute('INSERT OR REPLACE INTO metadata_extraction_runs VALUES(?,?)',(e['id'],VERSION));continue
  for o in db.execute('SELECT o.id,o.title,r.native_id FROM record_observations o JOIN catalog_records r ON r.id=o.record_key WHERE o.event_id=?',(e['id'],)):
   m=rows.get(o['native_id'])
   if not m or text(o['title'] or '')!=m['title']:continue
   args=(o['id'],*source,m['title'],m['authors_json'],m['edition'],m['language'],m['publisher'],m['publication_year'],m['fields_json'],VERSION,now())
   n+=db.execute('INSERT OR IGNORE INTO metadata_extractions VALUES('+','.join('?'*len(args))+')',args).rowcount
  db.execute('INSERT OR REPLACE INTO metadata_extraction_runs VALUES(?,?)',(e['id'],VERSION))
  if n%1000==0:db.commit()
 db.executescript("""DROP VIEW IF EXISTS book_details;
 CREATE VIEW book_details AS SELECT b.id observation_id,b.record_key,b.library_id,l.name library_name,l.country,l.system,b.connection_label,b.native_id,b.identity_kind,b.observed_at,b.title,
 coalesce(nullif(b.authors_json,'[]'),m.authors_json) authors_json,coalesce(b.edition,m.edition) edition,b.isbns_json,json_extract(m.fields_json,'$.ISBNLbl') native_isbn_statement,
 coalesce(b.publisher,m.publisher) publisher,coalesce(b.publication_year,m.publication_year) publication_year,coalesce(b.language,m.language) language,b.format,b.item_url,b.link_kind,
 coalesce((SELECT outcome FROM link_checks k WHERE k.library_id=b.library_id AND k.url=b.item_url ORDER BY observed_at DESC LIMIT 1),'unchecked') link_status,
 b.event_id,e.source,e.line,m.source_path metadata_source,m.source_sha256 metadata_source_sha256,m.extraction_version,m.analysis_at
 FROM library_books b JOIN libraries l ON l.id=b.library_id JOIN events e ON e.id=b.event_id LEFT JOIN metadata_extractions m ON m.observation_id=b.id;
 """)
 db.commit();return n
