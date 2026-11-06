"""Search the public NCERT textbook-selector metadata, without fetching books."""
import fcntl,hashlib,json,re,time
from pathlib import Path
from run_source_reviews import robots,request,pacing_seconds,now
from source_registry import REGISTRY,USER_AGENT,evaluate
ENDPOINT='https://epathshala.ncert.gov.in/test.html'


def literal_array(text,name):
    matches=list(re.finditer(r'\bconst\s+'+re.escape(name)+r'\s*=\s*\[',text))
    if len(matches)!=1:raise ValueError('Missing/ambiguous published '+name+' array')
    start=matches[0].end()-1;out=[];comments=[];i=start;depth=0;string=False;escaped=False
    while i<len(text):
        ch=text[i]
        if string:
            out.append(ch)
            if escaped:escaped=False
            elif ch=='\\':escaped=True
            elif ch=='"':string=False
            i+=1;continue
        if text.startswith('/*',i):
            end=text.find('*/',i+2)
            if end<0:raise ValueError('Unterminated metadata comment')
            comments.append(text[i+2:end]);out.append(' ');i=end+2;continue
        if text.startswith('//',i):
            end=text.find('\n',i+2)
            if end<0:raise ValueError('Unterminated metadata line comment')
            comments.append(text[i+2:end]);out.append('\n');i=end+1;continue
        out.append(ch)
        if ch=='"':string=True
        elif ch=='[':depth+=1
        elif ch==']':
            depth-=1
            if depth==0:
                if not text[i+1:].lstrip().startswith(';'):raise ValueError('Nonliteral metadata expression')
                return json.loads(''.join(out)),comments
        i+=1
    raise ValueError('Incomplete metadata array')


def parse(body):
    text=body.decode('utf-8')
    if '</html>' not in text.lower() or 'id="class"' not in text or 'id="book"' not in text or '"/wp-content/doc/book/flipbook/"+pre+".html"' not in text:
        raise ValueError('Incomplete or changed textbook-selector contract')
    subjects,_=literal_array(text,'subjects');books,comments=literal_array(text,'books');contexts={}
    for grade,group in enumerate(subjects,1):
        for sid,subject in group:
            if not re.fullmatch('C'+str(grade)+r'S[1-9][0-9]*',sid) or sid in contexts:raise ValueError('Invalid class/subject identity')
            contexts[sid]={'class_selector':grade,'class_label':'XI & XII combined' if grade==13 else str(grade),'subject_selector':sid,'subject':subject}
    rows={};conflicts={};unresolved=[]
    for group in books:
        for sid,title,native in group:
            if not title.strip() or not re.fullmatch(r'[a-z0-9]+',native):raise ValueError('Invalid book-selector metadata')
            if sid not in contexts:
                unresolved.append({'subject_selector':sid,'title':title,'native_id':native,'reason':'Published subject selector has no matching subject definition; no inferred correction'})
                continue
            if native not in rows:
                language=re.search(r'\((English|Hindi|Urdu|Marathi|Sindhi|Punjabi|Gujarati|Malayalam|Konkani|Assamese|Maithili|Bodo|Sanskrit|Oriya|Bengali|Santhali|Manipuri|Nepali|Telugu|Kannada|Tamil|Dogri|Kashmiri)\)',title)
                rows[native]={'id':native,'title':title,'declared_language_label':language[1] if language else None,
                    'contexts':[],'landing_page':ENDPOINT,'listed_reader_url':'https://epathshala.ncert.gov.in/wp-content/doc/book/flipbook/'+native+'.html',
                    'identity_scope':'Native published book selector/reader code; no edition/publication-year inference','reading_access_verified':False}
            if rows[native]['title']!=title:conflicts.setdefault(native,[rows[native]['title']]).append(title)
            if contexts[sid] not in rows[native]['contexts']:rows[native]['contexts'].append(contexts[sid])
    if not rows:raise ValueError('Empty published catalog')
    return {'records':[r for native,r in rows.items() if native not in conflicts],'conflicting_native_ids':conflicts,
        'active_selector_rows':sum(len(g) for g in books),'unresolved_context_rows':unresolved,'commented_metadata_blocks':comments}


def search(rows,q):
    if set(q)!={'field','value','class_selector'} or q['field'] not in ('title','id') or not isinstance(q['value'],str) or not q['value'].strip():raise ValueError('Unsupported local query')
    grade=q['class_selector']
    if grade is not None and (isinstance(grade,bool) or grade not in range(1,14)):raise ValueError('Invalid class selector')
    return [r for r in rows if (r['id']==q['value'] if q['field']=='id' else q['value'].casefold() in r['title'].casefold()) and (grade is None or any(c['class_selector']==grade for c in r['contexts']))]


def assess(source,case,cap,body):
    rows=[];error=cap.get('error')
    try:
        h=cap['http']
        if error or h['status']!=200 or h['truncated']:raise ValueError(error or 'Unsuccessful/incomplete published catalog')
        if h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Mismatched metadata capture')
        rows=search(parse(body)['records'],case['request']['local_query'])
    except (KeyError,TypeError,ValueError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),'full_content_downloaded':False,'query_execution':'local title or native-code search over public selector metadata; optional published class filter'},{'results':rows})


def probe(source,case_ids=None):
    if source['id']!='ncert' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);p,proof=robots(ENDPOINT);body=b''
        cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}}
        if p is False or p is not None and not all(p.can_fetch(ua,ENDPOINT) for ua in [USER_AGENT,'ChatGPT-User','OAI-SearchBot']):cap['error']='Policy unavailable/disallowing'
        else:time.sleep(pacing_seconds(p));cap['http'],body=request(ENDPOINT,limit=512*1024)
        for c in source['query']['cases']:
            if case_ids and c['id'] not in case_ids:continue
            if c['request']['method']!='GET' or c['request']['url']!=ENDPOINT:raise ValueError('Unreviewed request')
            obs=assess(source,c,cap,body)
            with (REGISTRY/'examples/ncert.jsonl').open('a') as f:f.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
            print(c['id'],obs['verdict'],obs['error'],flush=True)
