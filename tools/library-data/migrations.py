"""Explicit, additive migrations for the derived index. Original observations are untouched."""
import hashlib
import json


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def version_id(library, label, fingerprint):
    return hashlib.sha256(canonical([library, label, fingerprint]).encode()).hexdigest()


def retain_connection(db, connection):
    """A configuration is known only when its actual bytes were indexed."""
    c = dict(connection)
    vid = version_id(c['library_id'], c['label'], c['fingerprint'])
    old = db.execute('SELECT config_json FROM connection_versions WHERE id=?', (vid,)).fetchone()
    if old and old[0] != c['config_json']:
        raise ValueError('Conflicting immutable connection version: ' + vid)
    db.execute('INSERT OR IGNORE INTO connection_versions(id,library_id,label,fingerprint,config_json) VALUES(?,?,?,?,?)',
               (vid, c['library_id'], c['label'], c['fingerprint'], c['config_json']))
    return vid


def migrate(db):
    version = db.execute('SELECT max(version) FROM schema_version').fetchone()[0]
    if version > 2:
        raise ValueError('Database schema is newer than this reader')
    if version < 2:
        db.executescript('''BEGIN;
        CREATE TABLE connection_versions(
          id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id), label TEXT NOT NULL,
          fingerprint TEXT NOT NULL, config_json TEXT NOT NULL,
          indexed_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          UNIQUE(library_id,label,fingerprint));
        CREATE TRIGGER immutable_connection_update BEFORE UPDATE ON connection_versions
          BEGIN SELECT RAISE(ABORT,'Connection versions are immutable'); END;
        CREATE TRIGGER immutable_connection_delete BEFORE DELETE ON connection_versions
          BEGIN SELECT RAISE(ABORT,'Connection versions are immutable'); END;
        CREATE TABLE runtime_inventory(version_id TEXT PRIMARY KEY REFERENCES connection_versions(id),
          descriptor_json TEXT NOT NULL, inspected_at TEXT NOT NULL);
        CREATE TABLE review_libraries(library_id TEXT PRIMARY KEY,name TEXT,country TEXT,system TEXT,
          status TEXT,app_eligible INTEGER,last_check TEXT,data_json TEXT NOT NULL);
        CREATE INDEX review_library_filters ON review_libraries(country,system,status,library_id);
        CREATE TABLE review_records(record_key TEXT PRIMARY KEY REFERENCES catalog_records(id),
          observation_id TEXT NOT NULL REFERENCES record_observations(id),first_seen TEXT,last_seen TEXT,
          observation_count INTEGER,decision TEXT,last_native_validation TEXT,decision_at TEXT);
        CREATE TABLE review_cache(key TEXT PRIMARY KEY,value_json TEXT NOT NULL);
        CREATE INDEX searches_filter ON searches(library_id,query,observed_at,id);
        CREATE INDEX searches_date ON searches(observed_at,id);
        CREATE INDEX result_observation ON query_results(observation_id);
        INSERT INTO schema_version VALUES(2);
        COMMIT;''')
    for row in db.execute('SELECT * FROM connections').fetchall():
        retain_connection(db, row)


def retain_snapshot_runtime(db, snapshot):
    for row in snapshot.get('runtime', []):
        c = db.execute('SELECT * FROM connections WHERE library_id=? AND label=?',
                       (row['libraryId'], row['connectionId'])).fetchone()
        if c:
            vid = retain_connection(db, c)
            db.execute("INSERT INTO runtime_inventory VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) "
                       "ON CONFLICT(version_id) DO UPDATE SET descriptor_json=excluded.descriptor_json,inspected_at=excluded.inspected_at",
                       (vid, canonical(row)))
