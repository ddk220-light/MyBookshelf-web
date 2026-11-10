PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_version VALUES(1);
CREATE TABLE IF NOT EXISTS libraries(id TEXT PRIMARY KEY,name TEXT,country TEXT,system TEXT,metadata_json TEXT);
CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,library_id TEXT REFERENCES libraries(id),label TEXT,fingerprint TEXT,config_json TEXT,UNIQUE(library_id,label));
CREATE TABLE IF NOT EXISTS aliases(alias TEXT PRIMARY KEY,library_id TEXT REFERENCES libraries(id));
CREATE TABLE IF NOT EXISTS sources(path TEXT PRIMARY KEY,bytes INTEGER,offset INTEGER,sha256 TEXT,kind TEXT);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,source TEXT,line INTEGER,type TEXT,library_id TEXT,observed_at TEXT,analysis_at TEXT,raw_json TEXT,content_sha256 TEXT);
CREATE TABLE IF NOT EXISTS event_locations(event_id TEXT REFERENCES events(id),source TEXT,line INTEGER,PRIMARY KEY(event_id,source,line));
CREATE TABLE IF NOT EXISTS evidence_objects(sha256 TEXT PRIMARY KEY,bytes INTEGER,archive_key TEXT);
CREATE TABLE IF NOT EXISTS evidence_files(path TEXT PRIMARY KEY,stored_sha256 TEXT REFERENCES evidence_objects(sha256),bytes INTEGER,raw_sha256 TEXT,raw_bytes INTEGER,mtime_ns INTEGER);
CREATE TABLE IF NOT EXISTS evidence_refs(event_id TEXT REFERENCES events(id),path TEXT REFERENCES evidence_files(path),expected_sha256 TEXT,PRIMARY KEY(event_id,path));
CREATE TABLE IF NOT EXISTS unmapped_evidence(event_id TEXT PRIMARY KEY,source_id TEXT,reason TEXT);
CREATE TABLE IF NOT EXISTS invalidations(event_id TEXT PRIMARY KEY,source_event_id TEXT,reason TEXT);
CREATE TABLE IF NOT EXISTS checks(id TEXT PRIMARY KEY REFERENCES events(id),library_id TEXT REFERENCES libraries(id),connection_label TEXT,observed_at TEXT,analysis_at TEXT,kind TEXT,status TEXT,reason TEXT,book_count INTEGER,observation_kind TEXT,configuration_fingerprint TEXT,scope TEXT);
CREATE TABLE IF NOT EXISTS searches(id TEXT PRIMARY KEY REFERENCES events(id),library_id TEXT REFERENCES libraries(id),connection_label TEXT,observed_at TEXT,query TEXT,field TEXT,profile_json TEXT,outcome TEXT,returned INTEGER,native_total INTEGER,wall_ms REAL,error TEXT,observation_kind TEXT);
CREATE TABLE IF NOT EXISTS catalog_records(id TEXT PRIMARY KEY,library_id TEXT REFERENCES libraries(id),connection_label TEXT,native_id TEXT,identity_kind TEXT);
CREATE TABLE IF NOT EXISTS record_observations(id TEXT PRIMARY KEY,event_id TEXT REFERENCES events(id),record_key TEXT REFERENCES catalog_records(id),observed_at TEXT,title TEXT,authors_json TEXT,edition TEXT,isbns_json TEXT,publisher TEXT,publication_year TEXT,language TEXT,format TEXT,item_url TEXT,link_kind TEXT,raw_json TEXT,extraction_version TEXT,analysis_at TEXT);
CREATE TABLE IF NOT EXISTS query_results(search_id TEXT REFERENCES searches(id),rank INTEGER,observation_id TEXT REFERENCES record_observations(id),relevant INTEGER,PRIMARY KEY(search_id,rank));
CREATE TABLE IF NOT EXISTS book_decisions(event_id TEXT PRIMARY KEY REFERENCES events(id),observation_id TEXT REFERENCES record_observations(id),decision TEXT,reason TEXT);
CREATE TABLE IF NOT EXISTS link_checks(event_id TEXT PRIMARY KEY REFERENCES events(id),library_id TEXT,url TEXT,observed_at TEXT,tested INTEGER,identity_confirmed INTEGER,outcome TEXT,raw_json TEXT);
CREATE INDEX IF NOT EXISTS checks_lib ON checks(library_id,observed_at);
CREATE INDEX IF NOT EXISTS searches_lib ON searches(library_id,observed_at);
CREATE INDEX IF NOT EXISTS records_lib ON catalog_records(library_id);
CREATE INDEX IF NOT EXISTS obs_record ON record_observations(record_key,observed_at);
CREATE VIEW IF NOT EXISTS library_current AS
WITH ranked AS (SELECT *,row_number() OVER(PARTITION BY library_id ORDER BY observed_at DESC,id DESC) n FROM checks WHERE kind='native' AND status!='Interrupted' AND NOT EXISTS(SELECT 1 FROM invalidations i WHERE i.source_event_id=checks.id)),
success AS (SELECT library_id,max(observed_at) at FROM checks WHERE status='Working' AND kind='native' AND observation_kind='live_http' AND NOT EXISTS(SELECT 1 FROM invalidations i WHERE i.source_event_id=checks.id) GROUP BY library_id),
app AS (SELECT *,row_number() OVER(PARTITION BY library_id,connection_label ORDER BY observed_at DESC,id DESC) n FROM checks WHERE kind='app' AND observation_kind='live_http' AND status!='Interrupted' AND NOT EXISTS(SELECT 1 FROM invalidations i WHERE i.source_event_id=checks.id))
SELECT l.id library_id,l.name,l.country,l.system,coalesce(r.status,'Not checked') status,r.observed_at last_check,cast(julianday('now')-julianday(r.observed_at) AS INTEGER) last_check_age_days,r.reason,r.book_count benchmark_books,s.at last_successful_check,
(SELECT max(observed_at) FROM app a WHERE a.library_id=l.id) last_app_check,
coalesce((SELECT status FROM app a WHERE a.library_id=l.id ORDER BY observed_at DESC LIMIT 1),'Not checked') last_app_status,
(SELECT max(observed_at) FROM app a WHERE a.library_id=l.id AND status='Working') last_successful_app_check,
EXISTS(SELECT 1 FROM app a JOIN connections c ON c.library_id=a.library_id AND c.label=a.connection_label WHERE a.library_id=l.id AND a.n=1 AND a.status='Working' AND a.configuration_fingerprint=c.fingerprint) app_eligible,
CASE WHEN EXISTS(SELECT 1 FROM app a JOIN connections c ON c.library_id=a.library_id AND c.label=a.connection_label WHERE a.library_id=l.id AND a.n=1 AND a.status='Working' AND a.configuration_fingerprint=c.fingerprint) THEN 'live_app_search_verified_current_configuration' ELSE 'no_current_configuration_live_app_search_proof' END eligibility_reason,
(SELECT count(*) FROM searches q WHERE q.library_id=l.id) searches,
(SELECT count(*) FROM searches q WHERE q.library_id=l.id AND q.outcome='success') successful_queries,
(SELECT count(*) FROM searches q WHERE q.library_id=l.id AND q.outcome='empty') empty_queries,
(SELECT count(*) FROM searches q WHERE q.library_id=l.id AND q.outcome='failed') failed_queries,
(SELECT count(*) FROM catalog_records b WHERE b.library_id=l.id AND b.identity_kind='native_bibliographic') observed_native_records
FROM libraries l LEFT JOIN ranked r ON r.library_id=l.id AND r.n=1 LEFT JOIN success s ON s.library_id=l.id;
CREATE VIEW IF NOT EXISTS library_books AS
SELECT * FROM (SELECT o.*,r.library_id,r.connection_label,r.native_id,r.identity_kind,row_number() OVER(PARTITION BY o.record_key ORDER BY o.observed_at DESC,o.id DESC) n FROM record_observations o JOIN catalog_records r ON r.id=o.record_key) WHERE n=1;
CREATE VIEW IF NOT EXISTS returned_results AS
SELECT s.library_id,s.connection_label,s.observed_at,s.query,s.field,q.rank,q.relevant,o.*,e.source,e.line FROM query_results q JOIN searches s ON s.id=q.search_id JOIN record_observations o ON o.id=q.observation_id JOIN events e ON e.id=s.id;

CREATE VIEW IF NOT EXISTS item_links AS
WITH urls AS (SELECT DISTINCT r.library_id,o.item_url url,o.link_kind FROM record_observations o JOIN catalog_records r ON r.id=o.record_key WHERE o.item_url IS NOT NULL), latest AS (SELECT *,row_number() OVER(PARTITION BY library_id,url ORDER BY observed_at DESC,event_id DESC) n FROM link_checks)
SELECT u.*,coalesce(l.tested,0) tested,coalesce(l.identity_confirmed,0) identity_confirmed,coalesce(l.outcome,'unchecked') outcome,l.observed_at checked_at,l.event_id FROM urls u LEFT JOIN latest l ON l.library_id=u.library_id AND l.url=u.url AND l.n=1;

CREATE INDEX IF NOT EXISTS observations_event ON record_observations(event_id);
CREATE INDEX IF NOT EXISTS links_item ON link_checks(library_id,url,observed_at);
