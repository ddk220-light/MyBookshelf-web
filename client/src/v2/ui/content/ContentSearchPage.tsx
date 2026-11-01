import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { contentApi } from '../../contentApi';
import { PublicApiError } from '../../api';
import type { ContentPage, ContentSourceStatus } from '../../contentTypes';
import { useMediaQuery } from '../../useMediaQuery';
import { useLibrary } from '../../context';
import { Sheet } from '../Sheet';
import { ContentResult } from './ContentResult';
import { ContentDetail } from './ContentDetailPage';
import { SearchIcon } from '../icons';
import './content.css';

const memory=new Map<string,{page:ContentPage;expires:number}>();
function remembered(key:string){const value=memory.get(key);if(value&&value.expires>Date.now())return value.page;memory.delete(key);return undefined;}
const sourceNames:Record<string,string>={bookdash:'Book Dash',gutenberg:'Project Gutenberg','open-textbook-library':'Open Textbook Library',europepmc:'Europe PMC',doaj:'DOAJ',arxiv:'arXiv',openalex:'Wide paper search','children-pilot':'Reviewed children’s starter set',storyweaver:'StoryWeaver'};
function sourceStatus(source:ContentSourceStatus){return ({ok:`${source.returned} shown`,searching:'Searching…',disabled:'Not connected yet',not_selected:'Not searched this time',queued:'Busy · try again',timeout:'Timed out',throttled:'Please try later',quota_exhausted:'At today’s limit',unavailable:'Could not answer',unsupported:'Filter not supported'} as Record<string,string>)[source.status]||'Could not answer';}

export function SearchScopes({scope}:{scope:'library'|'free'|'papers'}){
  const location=useLocation();const q=new URLSearchParams(location.search).get('q');
  return <nav className="content-scopes segment-control" aria-label="Search scope">{(['library','free','papers'] as const).map(value=>
    <Link key={value} className={scope===value?'selected':''} aria-current={scope===value?'page':undefined}
      to={'/app/search'+(value!=='library'||q?'?'+new URLSearchParams({...value!=='library'?{scope:value}:{},...q?{q}:{}}):'')}>{value==='library'?'Library books':value==='free'?'Free to read':'Papers'}</Link>)}</nav>;
}

export function ContentSearchPage({scope}:{scope:'free'|'papers'}) {
  const location=useLocation();const navigate=useNavigate();const {library}=useLibrary();
  const params=new URLSearchParams(location.search);const query=params.get('q')||'';const selected=params.get('item');
  const textbooks=scope==='free'&&params.get('collection')==='textbooks';
  const children=scope==='free'&&params.get('collection')==='children';
  const sourceParam=params.get('source');
  const onlySource=scope==='papers'&&sourceParam&&['europepmc','doaj','arxiv','openalex'].includes(sourceParam)?sourceParam:null;
  const [input,setInput]=useState(query);const [unclear,setUnclear]=useState(false);const [language,setLanguage]=useState('');
  const [level,setLevel]=useState('');const searchLanguage=scope==='papers'?'':language;
  const memoryKey=scope+':'+textbooks+':'+children+':'+onlySource+':'+query+':'+unclear+':'+searchLanguage+':'+level;
  const [page,setPage]=useState<ContentPage|null>(()=>remembered(memoryKey)||null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState<PublicApiError|null>(null);const [retry,setRetry]=useState(0);
  const [sourcesOpen,setSourcesOpen]=useState(false);const controller=useRef<AbortController|null>(null);
  const [progress,setProgress]=useState<ContentSourceStatus[]>([]);
  const desktop=useMediaQuery('(min-width: 1100px)');
  useEffect(()=>{setInput(query);},[query]);
  const load=useCallback(async(cursor?:string,retrySource?:string)=>{
    controller.current?.abort();const request=new AbortController();controller.current=request;setBusy(true);setError(null);setProgress([]);
    try{
      const result=await contentApi.search(query,scope==='free'?(children?['book']:textbooks?['learning_resource']:['book','learning_resource']):['article','preprint','chapter','thesis','report'],
        {includeUnclear:unclear,...children?{collection:'children',...level?{level}:{}}:{},...onlySource?{sourceIds:[onlySource]}:{},...searchLanguage?{languages:[searchLanguage]}:{},...cursor?{cursor}:{},...retrySource?{retrySource}:{}},request.signal,
        source=>{if(!request.signal.aborted)setProgress(rows=>Array.from(new Map([...rows,source].map(row=>[row.id,row])).values()));});
      if(request.signal.aborted)return;
      const previous=cursor?remembered(memoryKey)?.items||[]:[];
      const items=Array.from(new Map([...previous,...result.items].map(item=>[item.key,item])).values());
      const sources=result.sources.map(source=>({...source,returned:items.filter(item=>source.id==='children-pilot'?item.collections?.includes('children'):item.provenance.some(p=>p.sourceId===source.id)).length}));
      const next={...result,items,sources};setPage(next);memory.set(memoryKey,{page:next,expires:Date.now()+900000});
      if(memory.size>12)memory.delete(memory.keys().next().value!);
    }catch(failure){if(!request.signal.aborted)setError(failure instanceof PublicApiError?failure:new PublicApiError());}
    finally{if(controller.current===request)setBusy(false);}
  },[query,scope,textbooks,children,onlySource,unclear,searchLanguage,level,memoryKey]);
  useEffect(()=>{
    setError(null);const saved=remembered(memoryKey);setPage(saved||null);
    if((query||children)&&!saved)void load();
    return()=>controller.current?.abort();
  },[query,children,memoryKey,retry,load]);
  const sources=busy&&progress.length?progress:error?.sources||page?.sources||[];
  const failed=sources.filter(source=>!['ok','disabled','not_selected','searching'].includes(source.status));
  const free=page?.items.filter(item=>item.access==='free_full_text')||[];
  const account=page?.items.filter(item=>item.access==='free_account_required')||[];
  const unknown=page?.items.filter(item=>item.access==='unknown')||[];
  const returnTo='/app/search?'+new URLSearchParams({scope,q:query,...children?{collection:'children'}:textbooks?{collection:'textbooks'}:{},...onlySource?{source:onlySource}:{}});
  const itemLink=(key:string)=>desktop?returnTo+'&item='+encodeURIComponent(key):'/app/read/'+encodeURIComponent(key);
  function submit(event:React.FormEvent){event.preventDefault();if(!input.trim()&&!children)return;setUnclear(false);
    if(input.trim()===query){again();return;}
    navigate('/app/search?'+new URLSearchParams({scope,q:input.trim(),...children?{collection:'children'}:textbooks?{collection:'textbooks'}:{},...onlySource?{source:onlySource}:{}}));}
  function again(){memory.delete(memoryKey);setRetry(value=>value+1);}
  return <section className="page-section content-search"><header className="page-heading"><h1>Search</h1></header>
    <form className="content-search-form" onSubmit={submit}><label className="visually-hidden" htmlFor="book-search">{scope==='papers'?'Search papers, DOI or arXiv ID':'Search free books'}</label>
      <input id="book-search" value={input} onChange={event=>setInput(event.target.value)} maxLength={300} type="search" placeholder={scope==='papers'?'Title, author or DOI':'Title or author'} />
      <button type="submit" aria-label="Search" disabled={busy}><SearchIcon/></button></form><SearchScopes scope={scope}/>
    {!query&&!children?<div className="content-start"><h2>{scope==='papers'?'Research papers, free to read':'Find something free to read'}</h2>
      <p>Read at the original source. No library card needed.</p><div className="content-browse">
        <Link to="/app/search?scope=free&q=literature"><strong>Classic literature</strong><span>Project Gutenberg</span></Link>
        <Link to="/app/search?scope=free&collection=textbooks&q=education"><strong>Open textbooks</strong><span>Open Textbook Library</span></Link>
        {import.meta.env.VITE_CHILDREN_PILOT_ENABLED==='true'?<Link to="/app/search?scope=free&collection=children"><strong>Children’s stories</strong><span>Reviewed starter set</span></Link>:<span aria-disabled="true"><strong>Children’s stories</strong><span>Reviewed starter set · not enabled yet</span></span>}
        <Link to="/app/search?scope=papers"><strong>Research papers</strong><span>From open research sources</span></Link></div></div>:<>
      {children&&<div className="content-start"><h2>A reviewed starter set</h2><p>Stories in English, <span lang="hi">हिन्दी</span> and <span lang="ta">தமிழ்</span>. This is a small reviewed collection, not every free children’s book. Levels are as the publisher labels them; they do not imply an age.</p></div>}
      <div className="content-filters"><label><span className="visually-hidden">Language</span><select aria-label="Language" value={searchLanguage} disabled={scope==='papers'} title={scope==='papers'?'Language filtering across paper sources is not available yet.':undefined} onChange={e=>setLanguage(e.target.value)}>
        <option value="">All languages</option><option value="en">English</option><option value="hi" lang="hi">हिन्दी</option><option value="ta" lang="ta">தமிழ்</option></select></label>
        <button type="button" disabled title="Format filtering is not available for these sources yet." aria-describedby="content-format-help">All formats</button>
        <span id="content-format-help" className="visually-hidden">Format filtering is not available for these sources yet.</span>
        {children&&<label><span className="visually-hidden">Publisher level</span><select aria-label="Publisher level" value={level} disabled={!page?.availableLevels?.length} onChange={e=>setLevel(e.target.value)}><option value="">All publisher levels</option>{page?.availableLevels?.map(label=><option key={label} value={label}>{label}</option>)}</select></label>}
      </div>
      {textbooks&&<p className="content-coverage">Open textbooks · <Link to={'/app/search?scope=free&q='+encodeURIComponent(query)}>Search all free books</Link>. This catalog export does not supply languages; a language filter excludes those records.</p>}
      {busy&&<div role="status"><p>Checking sources… This should take no more than five seconds.</p><ul className="content-source-list">{progress.map(source=><li key={source.id}><span>{sourceNames[source.id]||source.name}</span><span>{source.status==='ok'?'Answered':sourceStatus(source)}</span></li>)}</ul></div>}
      {error&&<div className="content-notice" role="alert"><h2>{error.code==='CONTENT_COLLECTION_UNAVAILABLE'?'The starter set is still being checked':sources.some(s=>s.status==='quota_exhausted')?'At today’s limit':'Couldn’t check all sources'}</h2><p>{error.message}</p>
        <p>This does not mean there is no free copy.</p><button onClick={again}>Try again</button>{' · '}<Link to={'/app/search?q='+encodeURIComponent(query)}>Search library books instead</Link>
        {sources.length>0&&<button className="text-button" onClick={()=>setSourcesOpen(true)}>Sources</button>}</div>}
      {page&&<><div className="content-count"><span>{free.length+account.length} {scope==='papers'?(free.length+account.length===1?'paper':'papers'):(free.length+account.length===1?'free book':'free books')} shown</span><button className="text-button" onClick={()=>setSourcesOpen(true)}>Sources</button></div>
        {page.sources.some(s=>s.complete===false)&&<p className="content-coverage">Searching limited catalog snapshots{page.sources.some(s=>s.catalogRecords)?` with ${page.sources.reduce((sum,s)=>sum+(s.catalogRecords||0),0).toLocaleString()} records`:''}. Source coverage varies.</p>}
        {page.sources.some(s=>s.scope&&s.status==='ok')&&<p className="content-coverage">Coverage: {page.sources.filter(s=>s.scope&&s.status==='ok').map(s=>s.scope).join(' · ')}. See Sources for this search’s coverage.</p>}
        {failed.length>0&&<div className="content-notice"><p>Some sources could not answer. Other results are shown.</p>{page.sessionCursor&&failed.filter(s=>s.retryable).map(source=><button key={source.id} disabled={busy} onClick={()=>void load(page.sessionCursor,source.id)}>Try {sourceNames[source.id]||source.name} again</button>)}</div>}
        {page.sources.some(s=>s.id==='openalex'&&s.status==='quota_exhausted')&&<p className="content-notice">Wide paper search is at today’s limit. Other source results are shown.</p>}
        {page.sources.some(s=>s.freshness==='stale')&&<p className="content-notice">These source details need refreshing. Older reading links are marked unclear.</p>}
        <div className={'content-results-layout'+(desktop&&selected?' has-detail':'')}><div className="content-results">
          {free.map(item=><ContentResult key={item.key} item={item} to={itemLink(item.key)} returnTo={returnTo}/>)}
          {account.length>0&&<section aria-label="Free account required"><h2>Free account required</h2><p>These books are free to read after signing in at the source.</p>{account.map(item=><ContentResult key={item.key} item={item} to={itemLink(item.key)} returnTo={returnTo}/>)}</section>}
          {page.hiddenUnclear>0&&<p className="content-unclear-notice">{page.hiddenUnclear} {page.hiddenUnclear===1?'result has':'results have'} unclear access. <button className="text-button" onClick={()=>setUnclear(!unclear)}>{unclear?'Hide them':'Show them, labelled'}</button></p>}
          {!busy&&!error&&!failed.length&&!page.items.length&&<div className="content-empty"><h2>No verified free copy in these results</h2><p>{page.hiddenUnclear?'Some records need clearer access evidence.':'These sources answered but did not return a free copy for this search.'}</p>
            <Link className="button-link" to={library?'/app/search?q='+encodeURIComponent(query):'/app/libraries'}>{library?'Check your library':'Choose a library'}</Link></div>}
          {unknown.length>0&&<section aria-label="Unclear access"><h2>Unclear access</h2>{unknown.map(item=><ContentResult key={item.key} item={item} to={itemLink(item.key)} returnTo={returnTo}/>)}</section>}
          {page.nextCursor&&<button disabled={busy} onClick={()=>void load(page.nextCursor!)}>Show more</button>}
        </div>{desktop&&selected&&<aside className="content-selected"><ContentDetail contentKey={selected} returnTo={returnTo}/></aside>}</div>
      </>}
    </>}
    <Sheet open={sourcesOpen} title="Sources for this search" onClose={()=>setSourcesOpen(false)}><ul className="content-source-list">{sources.map(source=><li key={source.id}><strong>{sourceNames[source.id]||source.name||source.id}</strong><span>{sourceStatus(source)}</span>{source.status==='not_selected'&&scope==='papers'&&<Link to={'/app/search?'+new URLSearchParams({scope,q:query,source:source.id})} onClick={()=>setSourcesOpen(false)}>Search it</Link>}</li>)}</ul>
      <p>Sources can have different coverage. Counts describe the items loaded here.</p></Sheet>
  </section>;
}
