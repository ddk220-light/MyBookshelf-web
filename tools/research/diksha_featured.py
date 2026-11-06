"""Search explicitly labelled public featured-quiz metadata; no login or content."""
import fcntl,hashlib,json,re,time
from html.parser import HTMLParser
from pathlib import Path
from run_source_reviews import robots,request,pacing_seconds,now
from source_registry import REGISTRY,USER_AGENT,evaluate
ENDPOINT='https://diksha.gov.in/'
# Semantic label mappings reviewed against saved homepage cards. New/changed
# labels are quarantined, never guessed from tracking keys or image filenames.
TOPICS={"India's New Criminal Laws":'Criminal-Law', 'Mahakumbh Mela':'Kumbh-Mela',
    'Constitution Day':'Constitution-Day','Birsa Munda':'Birsa-Munda','Virasat aur Vikas':'Virasat-Aur-Vikas'}

class Cards(HTMLParser):
    def __init__(self):
        super().__init__();self.stack=[];self.cards=[];self.anchor=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='div':
            classes=set((a.get('class') or '').split());card={'alts':[],'links':[]} if {'d-block','w-100','position-relative'}<=classes else None
            self.stack.append(card)
        current=next((c for c in reversed(self.stack) if c is not None),None)
        if tag=='img' and current is not None and a.get('alt'):current['alts'].append(a['alt'])
        if tag=='a' and current is not None and re.fullmatch(r'https://diksha.gov.in/learn/course/do_\d+',a.get('href') or ''):
            self.anchor={'url':a['href'],'tracking_label':a.get('onclick'),'text':[]};current['links'].append(self.anchor)
    def handle_data(self,text):
        if self.anchor is not None:self.anchor['text'].append(text)
    def handle_endtag(self,tag):
        if tag=='a':self.anchor=None
        if tag=='div' and self.stack:
            card=self.stack.pop()
            if card and card['links']:self.cards.append(card)

def parse(body):
    text=body.decode('utf-8')
    if '</footer>' not in text.lower():raise ValueError('Incomplete public homepage footer')
    p=Cards();p.feed(text);records=[];quarantined=[];seen=set()
    for card in p.cards:
        labels=list(dict.fromkeys(card['alts']))
        if len(labels)!=1 or labels[0] not in TOPICS:
            quarantined.append({'card':card,'reason':'Ambiguous or unreviewed banner title/tracking-label relationship'});continue
        title=labels[0];candidate=[];bad=False
        for link in card['links']:
            m=re.fullmatch(r"handleClickTelemetryEvent\('"+re.escape(TOPICS[title])+r"-(English|Hindi)-Quiz'\)",link['tracking_label'] or '')
            label=' '.join(''.join(link['text']).split())
            if not m or label not in ('Click here to play the quiz','प्रश्नोत्तरी खेलने के लिए क्लिक करें'):bad=True;break
            language=m[1]
            if (language=='English')!=(label=='Click here to play the quiz'):bad=True;break
            native=link['url'].rsplit('/',1)[1]
            if native in seen:raise ValueError('Duplicate native quiz identity')
            seen.add(native);candidate.append({'id':native,'title':title+' — '+language+' quiz link','topic_label':title,
                'published_link_language':language,'landing_page':link['url'],'link_text':label,
                'identity_scope':'Native DIKSHA course link for featured quiz; language is published link label, not verified content language',
                'reading_access_verified':False})
        if bad or len(candidate)!=2 or {x['published_link_language'] for x in candidate}!={'English','Hindi'}:
            quarantined.append({'card':card,'reason':'Changed/mismatched topic-language labels; no inferred correction'})
        else:records.extend(candidate)
    if not records:raise ValueError('No reviewed featured quiz metadata')
    return {'records':records,'quarantined_cards':quarantined,'observed_featured_cards':len(p.cards)}

def search(rows,q):
    if set(q)!={'topic','link_language'} or q['link_language'] not in ('English','Hindi') or not isinstance(q['topic'],str) or not q['topic'].strip():raise ValueError('Unsupported featured-metadata query')
    return [r for r in rows if q['topic'].casefold() in r['topic_label'].casefold() and r['published_link_language']==q['link_language']]

def assess(source,case,cap,body):
    error=cap.get('error');rows=[]
    try:
        h=cap['http']
        if error or h['status']!=200 or h['truncated']:raise ValueError(error or 'Failed/incomplete public homepage')
        if hashlib.sha256(body).hexdigest()!=h['sampled_bytes_sha256']:raise ValueError('Mismatched source hash')
        rows=search(parse(body)['records'],case['request']['local_query'])
    except (KeyError,ValueError,TypeError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),'full_content_downloaded':False,
        'query_execution':'Local topic plus published link-language search over reviewed featured homepage metadata; no main-library query'},{'results':rows})

def probe(source,case_ids=None):
    if source['id']!='diksha' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);p,proof=robots(ENDPOINT);body=b'';cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}}
        if p is False or p is not None and not all(p.can_fetch(a,ENDPOINT) for a in [USER_AGENT,'ChatGPT-User','OAI-SearchBot']):cap['error']='Policy unavailable/disallowing'
        else:time.sleep(pacing_seconds(p));cap['http'],body=request(ENDPOINT,limit=512*1024)
        for c in source['query']['cases']:
            if case_ids and c['id'] not in case_ids:continue
            if c['request']['method']!='GET' or c['request']['url']!=ENDPOINT:raise ValueError('Unreviewed request')
            row=assess(source,c,cap,body)
            with (REGISTRY/'examples/diksha.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
            print(c['id'],row['verdict'],row['error'],flush=True)
