"""Allow a fully tested one-work catalog to count as queryable without padding.

This is a narrow metadata-search exception to the ten-example research sample.
It requires the complete short publisher listing, two current passing requests,
and an empty negative control, all tied to immutable captured responses.
"""
import hashlib
import json
from pathlib import Path
from metadata_links import parse_thoth
from source_registry import fingerprint


def verified_single_work(source, audit_row, registry):
    review = source.get('queryability_review')
    if not review or review.get('basis') != 'exhaustive-single-work-publisher-subset':
        return False
    relative = review.get('evidence_path', '')
    path = (registry / relative).resolve()
    if not path.is_relative_to(registry.resolve()) or not path.is_file():
        raise ValueError('Missing single-work queryability evidence')
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != review.get('evidence_sha256'):
        raise ValueError('Mismatched single-work queryability evidence hash')
    proof = json.loads(raw)
    q = source['query']
    if proof.get('source_id') != source['id'] or q.get('adapter') != 'thoth-metadata':
        return False
    def records(cap):
        body = cap['response_text'].encode()
        if cap['http']['status'] != 200 or cap['http']['truncated'] or hashlib.sha256(body).hexdigest() != cap['http']['sampled_bytes_sha256']:
            raise ValueError('Invalid single-work captured response')
        if cap['request']['url'] != 'https://api.thoth.pub/graphql' or cap['request']['method'] != 'POST':
            raise ValueError('Unreviewed publisher request')
        return parse_thoth(json.loads(body), q['publisher_id'])
    listing = records(proof['listing'])
    request = proof['listing']['request']['json']['query']
    if len(listing) != 1 or 'limit:15,' not in request or 'filter:' in request:
        return False
    sid = listing[0]['id']
    cases = q['cases']
    if len(cases) != 2 or audit_row.get('passing_examples', 0) != 2:
        return False
    if any(set(c['expected_ids']) != {sid} for c in cases):
        return False
    positives = proof['positive_queries']
    if len(positives) != 2 or {fingerprint(p['request']) for p in positives} != {fingerprint(c['request']) for c in cases}:
        return False
    for cap in positives:
        rows = records(cap)
        if len(rows) != 1 or rows[0]['id'] != sid or cap['query_text'].casefold() not in rows[0]['title'].casefold():
            return False
    negative = proof['negative_query']
    if negative['query_text'] != 'zzqxnomatch671932' or records(negative):
        return False
    return True


def verified_resolution_subset(source, audit_row, registry):
    """Count an exhaustively tested six-record guide without inventing extra items."""
    review=source.get('queryability_review',{})
    if review.get('basis')!='exhaustive-mkc-resolution-subset':return False
    if source['id']!='imo-knowledge-centre' or source['query']['adapter']!='imo-guidelines-catalog':return False
    from imo_guidelines_catalog import parse,search,assess,ENDPOINT
    path=(registry/review['evidence_path']).resolve()
    if not path.is_relative_to(registry.resolve()) or not path.is_file():raise ValueError('Missing resolution subset evidence')
    raw=path.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=review['evidence_sha256']:raise ValueError('Mismatched resolution subset evidence')
    proof=json.loads(raw);body_path=(registry/proof['capture_path']).resolve()
    if not body_path.is_relative_to(registry.resolve()) or not body_path.is_file():raise ValueError('Missing resolution capture')
    body=body_path.read_bytes();cap=proof['capture'];h=cap['http']
    if h['status']!=200 or h['truncated'] or h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Invalid resolution capture hash/status')
    if h['url']!=ENDPOINT or proof['source_id']!=source['id']:return False
    rows=parse(body);cases=source['query']['cases']
    if len(rows)!=6 or len(cases)!=6 or audit_row.get('passing_examples')!=6:return False
    if {r['id'] for r in rows}!={str(c['expected_ids'][0]) for c in cases if len(c['expected_ids'])==1}:return False
    if any(assess(source,c,cap,body)['verdict']!='verified' for c in cases):return False
    return proof.get('empty_query')=='qzxnevermatch2026' and not search(rows,{'field':'title','value':proof['empty_query']})
