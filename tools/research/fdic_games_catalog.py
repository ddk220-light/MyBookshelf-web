"""Metadata-only search of the anonymous FDIC games UI's published catalog request.

This is the request used by its public Resources page, not a promised external API.
No login, game assets, session endpoints or content downloads are used.
"""
import json
from urllib.parse import urljoin
from cmda_opencity_catalog import search
from run_source_reviews import robots, request, pacing_seconds, now
from source_registry import REGISTRY, USER_AGENT, evaluate
import hashlib
import fcntl
import time
from pathlib import Path

ENDPOINT='https://playmoneysmart.fdic.gov/api/game-categories'
MAX_BYTES=256*1024


def parse(body):
    if not isinstance(body,bytes) or len(body)>MAX_BYTES:
        raise ValueError('Metadata exceeds bound')
    data=json.loads(body)
    if not isinstance(data,list) or not 0<len(data)<=30:
        raise ValueError('Unexpected category list')
    rows=[]
    for category in data:
        if not isinstance(category,dict) or not isinstance(category.get('games'),list):
            raise ValueError('Invalid category')
        for game in category['games']:
            if not isinstance(game,dict) or type(game.get('id')) is not int or game['id']<=0:
                raise ValueError('Invalid game identity')
            if not isinstance(game.get('name'),str) or not game['name'].strip() or game.get('game_category_id')!=category.get('id'):
                raise ValueError('Invalid title/category association')
            link=game.get('url','')
            if not link.startswith('/moneysmart-games-') or not link.endswith('/story.html') or '..' in link:
                raise ValueError('Unexpected public game link')
            rows.append({'id':str(game['id']),'title':game['name'],'title_es':game.get('name_es'),
                'category_id':category['id'],'category':category.get('name'),
                'published_game_url':urljoin(ENDPOINT,link),'updated_at':game.get('updated_at'),
                'identity_namespace':'FDIC game ID','full_content_access_verified':False})
    if not 0<len(rows)<=100 or len({r['id'] for r in rows})!=len(rows):
        raise ValueError('Empty, unbounded or duplicate game identities')
    return rows


def assess(source,case,cap,body):
    error,rows=cap.get('error'),[]
    try:
        h=cap['http']
        if error or h['status']!=200 or h['truncated']:raise ValueError(error or 'Unsuccessful/incomplete metadata')
        if h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Capture hash mismatch')
        req=case['request']
        if req['method']!='GET' or req['url']!=ENDPOINT:raise ValueError('Unreviewed request')
        rows=search(parse(body),req['local_query'])
    except (KeyError,TypeError,ValueError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),
        'full_content_downloaded':False,'query_execution':'Local literal English-title/native-ID search over public UI metadata'}, {'results':rows})


def probe(source,case_ids=None):
    if source['id']!='fdic-money-smart' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        policy,proof=robots(ENDPOINT);body=b''
        cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}}
        if policy is False or policy is not None and not all(policy.can_fetch(a,ENDPOINT) for a in [USER_AGENT,'ChatGPT-User','OAI-SearchBot']):
            cap['error']='Policy unavailable/disallowing; no metadata request'
        else:
            time.sleep(pacing_seconds(policy));cap['http'],body=request(ENDPOINT,limit=MAX_BYTES)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            row=assess(source,case,cap,body)
            with (REGISTRY/'examples/fdic-money-smart.jsonl').open('a') as f:f.write(json.dumps(row,sort_keys=True)+'\n')
            print(case['id'],row['verdict'],row['error'],flush=True)
