"""Bounded research-only Appropedia Action API metadata queries."""
from datetime import datetime
import fcntl
import json
import re
import time
from urllib.parse import urlencode, urlsplit

from civic_catalogs import LOCK
from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://www.appropedia.org/w/api.php'


def policy():
    rule, proof = robots(ENDPOINT)
    # The provider explicitly redirects robots.txt to a missing MediaWiki page.
    # Follow only this observed same-host policy destination, never other targets.
    if proof.get('status') == 301 and proof.get('redirect_location') == 'https://www.appropedia.org/Robots.txt':
        time.sleep(3)
        resolved, _ = request(proof['redirect_location'], 65536)
        proof = {**resolved, 'redirect_chain': [proof, resolved]}
        return (None if resolved.get('status') == 404 else False), proof
    if proof.get('status') == 200 and 'text/html' in (proof.get('content_type') or ''):
        return False, proof
    return rule, proof


def allowed_request(req):
    if req.get('method') != 'GET' or req.get('url') != ENDPOINT:
        raise ValueError('Only the documented public Appropedia Action API GET')
    p = req.get('params', {})
    if any(p.get(k) != v for k, v in {'action': 'query', 'format': 'json', 'formatversion': 2, 'maxlag': 5}.items()):
        raise ValueError('Read-only JSON query with explicit lag bound required')
    common = {'action', 'format', 'formatversion', 'maxlag'}
    if p.get('list') == 'search':
        if (set(p) - common - {'list', 'srsearch', 'srnamespace', 'srlimit', 'srprop', 'sroffset'}
                or not isinstance(p.get('srsearch'), str) or not 1 <= len(p['srsearch'].strip()) <= 150
                or p.get('srnamespace') != 0 or type(p.get('srlimit')) is not int
                or not 1 <= p['srlimit'] <= 3 or p.get('srprop') != 'timestamp|wordcount|snippet'
                or 'sroffset' in p and (type(p['sroffset']) is not int or not 0 <= p['sroffset'] <= 30)):
            raise ValueError('Small article-only topic query required')
    elif (set(p) != common | {'prop', 'pageids', 'rvprop', 'rvlimit', 'inprop'}
          or p.get('prop') != 'info|revisions' or not re.fullmatch('[1-9][0-9]*', str(p.get('pageids', '')))
          or p.get('rvprop') != 'ids|timestamp' or p.get('rvlimit') != 1 or p.get('inprop') != 'url'):
        raise ValueError('One native article/revision only; no user, edit or body harvesting')


def stamp(value):
    if not isinstance(value, str) or not value.endswith('Z'):
        raise ValueError('Missing UTC edit/revision timestamp')
    try:
        datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        raise ValueError('Invalid edit/revision timestamp') from None


def parse(data, req):
    if not isinstance(data, dict) or data.get('error') or data.get('warnings'):
        raise ValueError('API error/warning must not become valid results')
    query = data.get('query')
    if not isinstance(query, dict):
        raise ValueError('Missing explicit query result')
    search = req['params'].get('list') == 'search'
    rows = query.get('search' if search else 'pages')
    if not isinstance(rows, list) or len(rows) > (3 if search else 1):
        raise ValueError('Invalid/oversized metadata results')
    result, seen = [], set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('Invalid article metadata')
        if not search and row.get('missing') is True:
            if str(row.get('pageid')) != str(req['params']['pageids']):
                raise ValueError('Missing marker does not match requested page')
            continue
        if (type(row.get('pageid')) is not int or row['pageid'] <= 0 or row['pageid'] in seen
                or row.get('ns') != 0 or not isinstance(row.get('title'), str) or not row['title'].strip()):
            raise ValueError('Invalid/duplicate article identity or namespace')
        record = {'id': str(row['pageid']), 'title': row['title'], 'record_kind': 'practical-knowledge-wiki-article',
                  'landing_page': f'https://www.appropedia.org/?curid={row["pageid"]}',
                  'reading_access_verified': False, 'procedural_safety_verified': False}
        if search:
            stamp(row.get('timestamp'))
            record.update(last_edit_observed=row['timestamp'], snippet_html=row.get('snippet'),
                          wordcount=row.get('wordcount'), revision_id=None)
        else:
            if str(row['pageid']) != str(req['params']['pageids']):
                raise ValueError('Wrong native page returned')
            revisions = row.get('revisions')
            if not isinstance(revisions, list) or len(revisions) != 1:
                raise ValueError('Exactly one native revision required')
            rev = revisions[0]
            if type(rev.get('revid')) is not int or rev['revid'] <= 0 or type(rev.get('parentid')) is not int:
                raise ValueError('Missing native revision/parent identity')
            stamp(rev.get('timestamp'))
            for key in ('fullurl', 'canonicalurl'):
                u = urlsplit(row.get(key, ''))
                if u.scheme != 'https' or u.netloc != 'www.appropedia.org':
                    raise ValueError('Unexpected native reader destination')
            record.update(landing_page=row['canonicalurl'], revision_id=rev['revid'],
                          parent_revision=rev['parentid'], last_edit_observed=rev['timestamp'],
                          language=row.get('pagelanguage'),
                          revision_url=f'https://www.appropedia.org/w/index.php?oldid={rev["revid"]}')
        seen.add(row['pageid'])
        result.append(record)
    return result


def capture(req, rule, proof):
    allowed_request(req)
    url = req['url'] + '?' + urlencode(req['params'])
    row = {'source_id': 'appropedia', 'observed_at': now(), 'request': req,
           'robots_evidence': proof, 'http': {'status': None, 'truncated': False}, 'query_verified': False}
    if rule is False or rule is not None and not rule.can_fetch(USER_AGENT, url):
        return {**row, 'outcome': 'skipped', 'error': 'Unavailable/disallowing policy; no target request'}
    time.sleep(pacing_seconds(rule))
    h, body = request(url, 256 * 1024, {'Accept': 'application/json'})
    row.update(http=h, response_sha256=h['sampled_bytes_sha256'])
    try:
        row['observed_output'] = json.loads(body)
    except (ValueError, UnicodeError):
        row['response_excerpt'] = body[:800].decode(errors='replace')
    if h['status'] != 200 or h['truncated']:
        return {**row, 'outcome': 'blocked-or-failed', 'error': h.get('error') or f'HTTP {h["status"]}'}
    if 'observed_output' not in row:
        return {**row, 'outcome': 'invalid-response', 'error': 'Expected public API JSON'}
    return {**row, 'outcome': 'captured'}


def probe(source, case_ids=None):
    with LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        rule, proof = policy()
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            row = capture(case['request'], rule, proof)
            records = []
            if row['outcome'] == 'captured':
                try:
                    records = parse(row['observed_output'], case['request'])
                except (ValueError, KeyError) as exc:
                    row.update(outcome='invalid-response', error=str(exc))
            value = evaluate(source, case, row, {'results': records})
            with (REGISTRY / 'examples' / 'appropedia.jsonl').open('a') as out:
                out.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], value['verdict'], row['http']['status'], flush=True)
            if row['outcome'] != 'captured':
                break
