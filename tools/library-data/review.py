#!/usr/bin/env python3
"""Private, loopback-only review of existing SQLite evidence; no provider code or requests."""
import argparse
import csv
import datetime
import io
import json
import pathlib
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit
from registry import connection_proposals, evidence_snapshot

HERE = pathlib.Path(__file__).resolve().parent
FILTERS = {'country','system','library','status','name','query','field','since','until','search','record','outcome','limit','offset'}


def open_readonly(path):
    db=sqlite3.connect(pathlib.Path(path).resolve().as_uri()+'?mode=ro',uri=True)
    db.row_factory=sqlite3.Row;db.execute('PRAGMA query_only=ON');db.execute('PRAGMA busy_timeout=5000')
    db.execute('PRAGMA cache_size=-16384')
    if db.execute('SELECT max(version) FROM schema_version').fetchone()[0]!=2:
        db.close();raise ValueError('Run library:data prepare before opening this review')
    return db


def normalize_params(params):
    if set(params)-FILTERS:raise ValueError('Unknown filter')
    out={}
    for k,v in params.items():
        if isinstance(v,list):
            if len(v)!=1:raise ValueError('Repeated filter: '+k)
            v=v[0]
        if len(str(v))>1000:raise ValueError('Filter too long')
        if str(v):out[k]=str(v)
    for k in ('since','until'):
        if k in out:
            try:date=datetime.datetime.fromisoformat(out[k].replace('Z','+00:00'))
            except ValueError:raise ValueError('Invalid ISO date: '+k)
            if date.tzinfo is None:date=date.replace(tzinfo=datetime.timezone.utc)
            out[k]=date.isoformat()
    if 'since' in out and 'until' in out and datetime.datetime.fromisoformat(out['since'])>datetime.datetime.fromisoformat(out['until']):raise ValueError('Date range is reversed')
    try:limit=int(out.get('limit',100));offset=int(out.get('offset',0))
    except ValueError:raise ValueError('Invalid pagination')
    if not 1<=limit<=500 or not 0<=offset<=2147483647:raise ValueError('Pagination out of bounds')
    out['limit']=limit;out['offset']=offset
    return out


def filter_sql(p, library='l', search=None):
    clauses=[];args=[]
    for key,column in [('country','country'),('system','system'),('library','library_id'),('status','status')]:
        if p.get(key):clauses.append(f'{library}.{column}=?');args.append(p[key])
    if p.get('name'):
        clauses.append(f'instr(lower({library}.name),lower(?))>0');args.append(p['name'])
    terms=[];termargs=[]
    for key,col in [('query','query'),('field','field'),('outcome','outcome'),('search','id')]:
        if p.get(key):terms.append(f's.{col}=?');termargs.append(p[key])
    for key,op in [('since','>='),('until','<=')]:
        if p.get(key):terms.append(f'julianday(s.observed_at){op}julianday(?)');termargs.append(p[key])
    if terms:
        if search:clauses.extend(t.replace('s.',search+'.') for t in terms)
        else:clauses.append(f'EXISTS(SELECT 1 FROM searches s WHERE s.library_id={library}.library_id AND '+ ' AND '.join(terms)+')')
        args.extend(termargs)
    return clauses,args


OBS_COLUMNS='''o.id observation_id,o.event_id,o.record_key,o.observed_at,o.title,
 coalesce(nullif(o.authors_json,'[]'),m.authors_json) authors_json,
 coalesce(o.edition,m.edition) edition,o.isbns_json,json_extract(m.fields_json,'$.ISBNLbl') native_isbn_statement,
 coalesce(o.publisher,m.publisher) publisher,coalesce(o.publication_year,m.publication_year) publication_year,
 coalesce(o.language,m.language) language,o.format,o.item_url,o.link_kind,r.native_id,r.identity_kind,
 m.source_path metadata_source,m.source_sha256 metadata_source_sha256,m.extraction_version metadata_extraction_version,
 m.analysis_at metadata_analysis_at,e.observed_at source_observed_at,e.analysis_at,
 e.source,e.line,coalesce(json_extract(e.raw_json,'$.observationKind'),CASE WHEN json_array_length(e.raw_json,'$.evidence')>0 THEN 'live_http' ELSE 'unknown' END) observation_kind,
 json_extract(e.raw_json,'$.query') original_query,coalesce(json_extract(e.raw_json,'$.field'),json_extract(e.raw_json,'$.profile.field')) original_field'''
OBS_JOIN='''JOIN catalog_records r ON r.id=o.record_key JOIN events e ON e.id=o.event_id
 LEFT JOIN metadata_extractions m ON m.observation_id=o.id'''
LINK_COLUMNS='''coalesce((SELECT k.outcome FROM link_checks k WHERE k.library_id=r.library_id AND k.url=o.item_url ORDER BY julianday(k.observed_at) DESC,k.event_id DESC LIMIT 1),'unchecked') link_status,
 (SELECT k.observed_at FROM link_checks k WHERE k.library_id=r.library_id AND k.url=o.item_url ORDER BY julianday(k.observed_at) DESC,k.event_id DESC LIMIT 1) link_checked_at,
 coalesce((SELECT k.tested FROM link_checks k WHERE k.library_id=r.library_id AND k.url=o.item_url ORDER BY julianday(k.observed_at) DESC,k.event_id DESC LIMIT 1),0) link_tested,
 coalesce((SELECT k.identity_confirmed FROM link_checks k WHERE k.library_id=r.library_id AND k.url=o.item_url ORDER BY julianday(k.observed_at) DESC,k.event_id DESC LIMIT 1),0) link_identity_confirmed'''


def dataset_sql(dataset,p):
    own_dates=dataset in ('checks','links','observations')
    clauses,args=filter_sql({k:v for k,v in p.items() if not own_dates or k not in ('since','until')},search='s' if dataset in ('searches','results','failures') else None)
    if own_dates:
        alias={'checks':'c','links':'k','observations':'o'}[dataset]
        for key,op in [('since','>='),('until','<=')]:
            if p.get(key):clauses.append(f'julianday({alias}.observed_at){op}julianday(?)');args.append(p[key])
    if dataset=='libraries':select='SELECT l.*';base=' FROM review_libraries l';order='l.library_id'
    elif dataset in ('searches','failures'):
        select='''SELECT s.*,l.name library_name,l.country,l.system,e.source,e.line,e.analysis_at,
         coalesce(json_extract(e.raw_json,'$.configurationFingerprint'),json_extract(s.profile_json,'$.configurationFingerprint')) configuration_fingerprint'''
        base=' FROM searches s JOIN review_libraries l ON l.library_id=s.library_id JOIN events e ON e.id=s.id';order='s.observed_at,s.id'
        if dataset=='failures':clauses.append("s.outcome IN ('failed','interrupted')")
    elif dataset=='results':
        select='SELECT s.id search_id,s.library_id,l.name library_name,l.country,l.system,s.connection_label,s.query,s.field,s.outcome query_outcome,s.observation_kind search_observation_kind,q.rank,q.relevant,'+OBS_COLUMNS+','+LINK_COLUMNS
        base=' FROM query_results q JOIN searches s ON s.id=q.search_id JOIN review_libraries l ON l.library_id=s.library_id JOIN record_observations o ON o.id=q.observation_id '+OBS_JOIN
        order='s.observed_at,s.id,q.rank'
    elif dataset in ('books','observations'):
        select='SELECT r.library_id,l.name library_name,l.country,l.system,r.connection_label,'+OBS_COLUMNS+','+LINK_COLUMNS
        if dataset=='books':
            select+=',c.first_seen,c.last_seen,c.observation_count,c.decision,c.last_native_validation,c.decision_at'
            select+=''',(SELECT max(s.observed_at) FROM record_observations ro JOIN query_results qr ON qr.observation_id=ro.id
              JOIN searches s ON s.id=qr.search_id WHERE ro.record_key=r.id AND qr.relevant=1 AND s.observation_kind='live_http'
              AND NOT EXISTS(SELECT 1 FROM invalidations i WHERE i.source_event_id=s.id)) last_relevant_search_match'''
            base=' FROM review_records c JOIN record_observations o ON o.id=c.observation_id '+OBS_JOIN
        else:base=' FROM record_observations o '+OBS_JOIN
        base+=' JOIN review_libraries l ON l.library_id=r.library_id';order='r.library_id,r.id' if dataset=='books' else 'o.observed_at,o.id'
        if p.get('record'):clauses.append('r.id=?');args.append(p['record'])
        # A query filter on records must match that record's observations, not merely its library.
        query_terms,query_args=filter_sql({k:v for k,v in p.items() if k in ('query','field','search','outcome') or dataset=='books' and k in ('since','until')},search='s')
        if query_terms:
            clauses.append('EXISTS(SELECT 1 FROM record_observations ro JOIN query_results qr ON qr.observation_id=ro.id JOIN searches s ON s.id=qr.search_id WHERE '+('ro.id=o.id' if dataset=='observations' else 'ro.record_key=r.id')+' AND '+' AND '.join(query_terms)+')');args.extend(query_args)
    elif dataset=='checks':
        select='SELECT c.*,l.name library_name,l.country,l.system,e.source,e.line,EXISTS(SELECT 1 FROM invalidations i WHERE i.source_event_id=c.id) invalidated'
        base=' FROM checks c JOIN review_libraries l ON l.library_id=c.library_id JOIN events e ON e.id=c.id';order='c.observed_at,c.id'
    elif dataset=='links':
        select='SELECT k.*,l.name library_name,l.country,l.system';base=' FROM link_checks k JOIN review_libraries l ON l.library_id=k.library_id';order='k.observed_at,k.event_id'
    else:raise ValueError('Unknown dataset')
    return select+base+(' WHERE '+' AND '.join(clauses) if clauses else '')+' ORDER BY '+order,args


def present(row,dataset):
    data=dict(row)
    if dataset=='libraries':
        data=json.loads(data['data_json'])
        if data.get('last_check'):
            date=datetime.datetime.fromisoformat(data['last_check'].replace('Z','+00:00'))
            if date.tzinfo is None:date=date.replace(tzinfo=datetime.timezone.utc)
            data['last_check_age_days']=(datetime.datetime.now(datetime.timezone.utc)-date).days
    for key in list(data):
        if key.endswith('_json') and data[key] is not None:
            data[key[:-5]]=json.loads(data.pop(key))
    if 'configuration_fingerprint' in data:data['historical_configuration_known']=False # resolved explicitly in search detail
    return data


def page(db,dataset,p):
    sql,args=dataset_sql(dataset,p)
    total=db.execute('SELECT count(*) FROM ('+sql.rsplit(' ORDER BY ',1)[0]+')',args).fetchone()[0]
    data=[present(r,dataset) for r in db.execute(sql+' LIMIT ? OFFSET ?',(*args,p['limit'],p['offset']))]
    return {'rows':data,'total':total,'offset':p['offset'],'limit':p['limit'],
            'nextOffset':p['offset']+len(data) if p['offset']+len(data)<total else None}


def evidence(db,event_id):
    source=db.execute('SELECT id,type,library_id,source,line,observed_at,analysis_at,content_sha256 FROM events WHERE id=?',(event_id,)).fetchone()
    if not source:raise KeyError('Unknown observation')
    original=db.execute('SELECT raw_json FROM events WHERE id=?',(event_id,)).fetchone()[0]
    return {'event':dict(source),'originalEvent':json.loads(original),'locations':[dict(r) for r in db.execute('SELECT source,line FROM event_locations WHERE event_id=?',(event_id,))],
            'evidence':[dict(r) for r in db.execute('SELECT f.*,r.expected_sha256,o.archive_key FROM evidence_refs r JOIN evidence_files f ON f.path=r.path JOIN evidence_objects o ON o.sha256=f.stored_sha256 WHERE r.event_id=?',(event_id,))]}


def summary(db,p):
    cache=db.execute("SELECT value_json FROM review_cache WHERE key='summary'").fetchone()
    if not cache:raise ValueError('Run prepare to refresh the review cache')
    result=json.loads(cache[0]);result['refreshedAt']=json.loads(db.execute("SELECT value_json FROM review_cache WHERE key='refreshedAt'").fetchone()[0])
    clauses,args=filter_sql(p,search='s')
    result['filteredSearches']=dict(db.execute('''SELECT count(*) observations,
      coalesce(sum(s.outcome='success'),0) successful,coalesce(sum(s.outcome='empty'),0) empty,
      coalesce(sum(s.outcome='failed'),0) failed,coalesce(sum(s.outcome='interrupted'),0) interrupted,
      coalesce(sum(s.returned),0) returned_candidates,count(s.wall_ms) timed_observations,avg(s.wall_ms) average_response_ms
      FROM searches s JOIN review_libraries l ON l.library_id=s.library_id'''+(' WHERE '+' AND '.join(clauses) if clauses else ''),args).fetchone())
    result['filters']={k:v for k,v in p.items() if k not in ('limit','offset')}
    result['coverageScope']='Complete imported snapshot; filteredSearches alone follows the selected query/date filters.'
    return result


def ensure_fresh_snapshot(db):
    row=db.execute("SELECT value_json FROM review_cache WHERE key='summary'").fetchone()
    if not row or json.loads(row[0])['evidenceSnapshot']!=evidence_snapshot(db):
        raise ValueError('Imported journals changed; run library:data prepare to refresh the review snapshot')


def dispatch(db,path,p):
    parts=path.strip('/').split('/')
    if parts==['api','summary']:return summary(db,p)
    if len(parts)==2:return page(db,parts[1],p)
    if len(parts)!=3:raise KeyError('Unknown route')
    kind,ident=parts[1],unquote(parts[2])
    if kind=='libraries':
        row=db.execute('SELECT * FROM review_libraries WHERE library_id=?',(ident,)).fetchone()
        if not row:raise KeyError('Unknown library')
        return {'library':present(row,'libraries'),'connections':connection_proposals(db,ident).get(ident,[]),
                'connectionVersions':[dict(r) for r in db.execute('SELECT * FROM connection_versions WHERE library_id=? ORDER BY indexed_at,id',(ident,))]}
    if kind=='searches':
        data=page(db,'searches',normalize_params({'search':ident,'limit':'1'}))['rows']
        if not data:raise KeyError('Unknown search')
        s=data[0];fp=s.get('configuration_fingerprint')
        version=db.execute('SELECT * FROM connection_versions WHERE library_id=? AND label=? AND fingerprint=?',(s['library_id'],s['connection_label'],fp)).fetchone() if fp else None
        s['historical_configuration_known']=bool(version)
        return {'search':s,'connectionVersion':dict(version) if version else None,**evidence(db,ident)}
    if kind=='books':
        records=page(db,'books',normalize_params({'record':ident,'limit':'1'}))['rows']
        if not records:raise KeyError('Unknown record')
        record=records[0]
        app= [dict(r) for r in db.execute("SELECT c.*,EXISTS(SELECT 1 FROM invalidations i WHERE i.source_event_id=c.id) invalidated FROM checks c JOIN events e ON e.id=c.id WHERE c.library_id=? AND c.connection_label=? AND c.kind='app' AND json_extract(e.raw_json,'$.nativeRecordId')=? ORDER BY c.observed_at,c.id",(record['library_id'],record['connection_label'],record['native_id']))]
        return {'book':record,'appAssessments':app,**evidence(db,record['event_id'])}
    if kind=='events':return evidence(db,ident)
    raise KeyError('Unknown detail route')


def csv_value(value):
    if isinstance(value,(dict,list)):return json.dumps(value,ensure_ascii=False)
    # Spreadsheet-safe exports; JSON retains byte-for-byte query/metadata strings.
    if isinstance(value,str) and value.lstrip().startswith(('=','+','-','@')):return "'"+value
    return value


def handler_for(db_path):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass # query terms do not go into access logs
        def response_headers(self,status,kind):
            self.send_response(status);self.send_header('Content-Type',kind)
            self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Security-Policy',"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        def json(self,status,value):
            self.response_headers(status,'application/json; charset=utf-8');self.end_headers();self.wfile.write(json.dumps(value,ensure_ascii=False).encode())
        def do_POST(self):self.json(405,{'error':'Read-only interface'})
        do_PUT=do_POST;do_DELETE=do_POST;do_PATCH=do_POST
        def do_GET(self):
            host=self.headers.get('Host','');allowed={f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
            if host not in allowed:return self.json(403,{'error':'Loopback Host required'})
            origin=self.headers.get('Origin');site=self.headers.get('Sec-Fetch-Site')
            if (origin and origin!='http://'+host) or site=='cross-site':return self.json(403,{'error':'Cross-origin reads are disabled'})
            url=urlsplit(self.path);assets={'/':'index.html','/review.js':'review.js','/review.css':'review.css'}
            if url.path in assets:
                name=assets[url.path];kind={'html':'text/html','js':'text/javascript','css':'text/css'}[name.rsplit('.',1)[1]]
                self.response_headers(200,kind+'; charset=utf-8');self.end_headers();self.wfile.write((HERE/'web'/name).read_bytes());return
            if not url.path.startswith('/api/'):return self.json(404,{'error':'Not found'})
            db=None
            try:
                p=normalize_params(parse_qs(url.query,keep_blank_values=True));db=open_readonly(db_path);db.execute('BEGIN');ensure_fresh_snapshot(db)
                if url.path.startswith('/api/export/') and url.path.endswith('.csv'):
                    dataset=url.path.split('/')[-1][:-4];sql,args=dataset_sql(dataset,p)
                    cursor=db.execute(sql,args);first=cursor.fetchone()
                    columns=list(present(first,dataset)) if first else [c[0] for c in cursor.description]
                    self.response_headers(200,'text/csv; charset=utf-8');self.send_header('Content-Disposition',f'attachment; filename="{dataset}.csv"');self.end_headers()
                    buf=io.StringIO();writer=csv.writer(buf)
                    def write(values):
                        writer.writerow(values);self.wfile.write(buf.getvalue().encode());buf.seek(0);buf.truncate(0)
                    write(columns)
                    if first:write([csv_value(present(first,dataset).get(c)) for c in columns])
                    for row in cursor:
                        data=present(row,dataset);write([csv_value(data.get(c)) for c in columns])
                else:self.json(200,dispatch(db,url.path,p))
            except KeyError as error:self.json(404,{'error':str(error)})
            except (ValueError,sqlite3.OperationalError) as error:self.json(400,{'error':str(error)})
            except (BrokenPipeError,ConnectionResetError):pass
            finally:
                if db:db.close()
    return Handler


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--db',type=pathlib.Path,default=pathlib.Path('/workspace/library-data/library-data.sqlite'));parser.add_argument('--port',type=int,default=4322);args=parser.parse_args()
    with open_readonly(args.db) as db:
        if not db.execute("SELECT 1 FROM review_cache WHERE key='summary'").fetchone():raise SystemExit('Run library:data prepare first')
    server=ThreadingHTTPServer(('127.0.0.1',args.port),handler_for(args.db));server.daemon_threads=True
    print(f'Private library review: http://127.0.0.1:{server.server_port} (read-only, existing evidence only)',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()


if __name__=='__main__':main()
