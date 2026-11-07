import {isContentSourceRetired} from '../../../../../shared/content-source-availability.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { contentApi } from '../../contentApi';
import { PublicApiError } from '../../api';
import type { ContentKind, ContentPage, ContentSourceStatus } from '../../contentTypes';
import { useMediaQuery } from '../../useMediaQuery';
import { useLibrary } from '../../context';
import { Sheet } from '../Sheet';
import { ContentResult } from './ContentResult';
import { ContentDetail } from './ContentDetailPage';
import { SearchIcon, OpenBookIcon, ShelfIcon } from '../icons';
import { contentMessages as m } from '../../uiMessages';
import { safeSource, sourceName, sourceStatus } from './presentation';
import './content.css';

const memory=new Map<string,{page:ContentPage;expires:number}>();
function remembered(key:string){const value=memory.get(key);if(value&&value.expires>Date.now())return value.page;memory.delete(key);return undefined;}
// Search history follows the existing same-tab search memory: bounded, never persisted.
const recentSearches=new Map<string,{query:string;scope:'free'|'papers';href:string}>();

export function SearchScopes({scope}:{scope:'library'|'free'|'papers'|'knowledge'}){
  const location=useLocation();const q=new URLSearchParams(location.search).get('q');
  return <nav className="content-scopes segment-control" aria-label="Search scope">{(['library','knowledge','free','papers'] as const).map(value=>
    <Link key={value} className={scope===value?'selected':''} aria-current={scope===value?'page':undefined}
      to={'/app/search'+(value!=='library'||q?'?'+new URLSearchParams({...value!=='library'?{scope:value}:{},...q?{q}:{}}):'')}>{value==='library'?'Library books':value==='knowledge'?'All knowledge':value==='free'?'Free to read':'Papers'}</Link>)}</nav>;
}

export function ContentSearchPage({scope}:{scope:'free'|'papers'}) {
  const location=useLocation();const navigate=useNavigate();const {library}=useLibrary();
  const params=new URLSearchParams(location.search);const query=params.get('q')||'';const selected=params.get('item');
  const textbooks=scope==='free'&&params.get('collection')==='textbooks';
  const children=scope==='free'&&params.get('collection')==='children';
  const sourceParam=params.get('source');
  const onlySource=scope==='papers'&&sourceParam&&['europepmc','doaj','arxiv','openalex'].includes(sourceParam)?sourceParam:null;
  const [input,setInput]=useState(query);const [unclear,setUnclear]=useState(false);const [language,setLanguage]=useState('');
  const [level,setLevel]=useState('');const [kind,setKind]=useState('');const searchLanguage=scope==='papers'?'':language;
  const memoryKey=scope+':'+textbooks+':'+children+':'+onlySource+':'+query+':'+unclear+':'+searchLanguage+':'+level+':'+kind;
  const [page,setPage]=useState<ContentPage|null>(()=>remembered(memoryKey)||null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState<PublicApiError|null>(null);const [retry,setRetry]=useState(0);
  const [sourcesOpen,setSourcesOpen]=useState(false);const controller=useRef<AbortController|null>(null);
  const [progress,setProgress]=useState<ContentSourceStatus[]>([]);
  const desktop=useMediaQuery('(min-width: 1100px)');
  useEffect(()=>{setInput(query);},[query]);
  const load=useCallback(async(cursor?:string,retrySource?:string)=>{
    controller.current?.abort();const request=new AbortController();controller.current=request;setBusy(true);setError(null);setProgress([]);
    try{
      const kinds:ContentKind[]=scope==='free'?(children?['book']:textbooks?['learning_resource']:['book','learning_resource']):['article','preprint','chapter','thesis','report'];
      const result=await contentApi.search(query,kind&&kinds.includes(kind as ContentKind)?[kind as ContentKind]:kinds,
        {includeUnclear:unclear,...children?{collection:'children',...level?{level}:{}}:{},...onlySource?{sourceIds:[onlySource]}:{},...searchLanguage?{languages:[searchLanguage]}:{},...cursor?{cursor}:{},...retrySource?{retrySource}:{}},request.signal,
        source=>{if(!request.signal.aborted)setProgress(rows=>Array.from(new Map([...rows,source].map(row=>[row.id,row])).values()));});
      if(request.signal.aborted)return;
      const previous=cursor?remembered(memoryKey)?.items||[]:[];
      const items=Array.from(new Map([...previous,...result.items].map(item=>[item.key,item])).values());
      const sources=result.sources.map(source=>({...source,returned:items.filter(item=>source.id==='children-pilot'?item.collections?.includes('children'):item.provenance.some(p=>p.sourceId===source.id)).length}));
      const next={...result,items,sources};setPage(next);memory.set(memoryKey,{page:next,expires:Date.now()+900000});
      if(memory.size>12)memory.delete(memory.keys().next().value!);
      if(query){const href='/app/search?'+new URLSearchParams({scope,q:query,...children?{collection:'children'}:textbooks?{collection:'textbooks'}:{},...onlySource?{source:onlySource}:{}});
        recentSearches.delete(href);recentSearches.set(href,{query,scope,href});if(recentSearches.size>6)recentSearches.delete(recentSearches.keys().next().value!);}
    }catch(failure){if(!request.signal.aborted)setError(failure instanceof PublicApiError?failure:new PublicApiError());}
    finally{if(controller.current===request)setBusy(false);}
  },[query,scope,textbooks,children,onlySource,unclear,searchLanguage,level,kind,memoryKey]);
  useEffect(()=>{
    setError(null);const saved=remembered(memoryKey);setPage(saved||null);
    if((query||children)&&!saved)void load();
    return()=>controller.current?.abort();
  },[query,children,memoryKey,retry,load]);
  const sources=busy&&progress.length?progress:error?.sources||page?.sources||[];
  const failed=sources.filter(source=>!['ok','empty','disabled','not_selected','searching'].includes(source.status));
  const interrupted=failed.filter(source=>source.status!=='quota_exhausted');
  const searched=sources.filter(source=>!['disabled','not_selected'].includes(source.status));
  const answered=searched.filter(source=>['ok','empty'].includes(source.status));
  const free=page?.items.filter(item=>item.access==='free_full_text')||[];
  const account=page?.items.filter(item=>item.access==='free_account_required')||[];
  const unknown=page?.items.filter(item=>item.access==='unknown')||[];
  const disabled=error?.code==='CONTENT_DISABLED';
  const restartRequired=error?.code==='CONTENT_CURSOR_EXPIRED'||error?.code==='CONTENT_CURSOR_INVALID';
  const disabledTitle=scope==='papers'?(onlySource||sources.some(s=>s.status==='not_selected')?'This paper source isn’t connected here':'Paper search isn’t enabled yet'):'Free-book search isn’t enabled yet';
  const activeSources=sources.filter(s=>!['disabled','not_selected'].includes(s.status));
  const errorTitle=disabled?disabledTitle:restartRequired?'Start this search again':error?.code==='CONTENT_COLLECTION_UNAVAILABLE'?'The starter set is still being checked':activeSources.length&&activeSources.every(s=>s.status==='quota_exhausted')?'At today’s limit':'Free-reading sources aren’t answering';
  const returnTo='/app/search?'+new URLSearchParams({scope,q:query,...children?{collection:'children'}:textbooks?{collection:'textbooks'}:{},...onlySource?{source:onlySource}:{}});
  const itemLink=(key:string)=>desktop?returnTo+'&item='+encodeURIComponent(key):'/app/read/'+encodeURIComponent(key);
  function submit(event:React.FormEvent){event.preventDefault();setUnclear(false);
    if(input.trim()===query){again();return;}
    navigate('/app/search?'+new URLSearchParams({scope,q:input.trim(),...children?{collection:'children'}:textbooks?{collection:'textbooks'}:{},...onlySource?{source:onlySource}:{}}));}
  function again(){memory.delete(memoryKey);setRetry(value=>value+1);}
  if(selected&&!desktop)return <ContentDetail contentKey={selected} returnTo={returnTo}/>;
  return <section className={'page-section content-search'+(children?' content-children':'')+(scope==='papers'?' content-papers':'')}>{children?<header className="content-childrens-header"><Link className="back-link" to="/app/search?scope=free">← Free to read</Link><h1>Children’s stories</h1><p>A starter set of picture books we’ve reviewed. It isn’t every free children’s book online.</p></header>:<div className="content-search-header"><header className="page-heading"><h1>Search</h1></header>
    <form className="content-search-form" onSubmit={submit}><label className="visually-hidden" htmlFor="book-search">{scope==='papers'?'Search papers, DOI or arXiv ID':'Search free books'}</label>
      <input id="book-search" value={input} onChange={event=>setInput(event.target.value)} maxLength={300} type="search" placeholder={scope==='papers'?'Title, author, DOI or arXiv ID':'Title, author or subject'} />
      <button type="submit" aria-label="Search" disabled={busy}><SearchIcon/></button></form><SearchScopes scope={scope}/></div>}
    {!query&&!children?<div className="content-start"><p>{scope==='papers'?m.papersIntro:m.startIntro}</p><h2 className="content-section-label">Browse</h2><div className="content-browse">
        <Link to="/app/search?scope=free&q=literature"><ShelfIcon/><strong>Classic literature</strong><span>Project Gutenberg</span></Link>
        <Link to="/app/search?scope=free&collection=textbooks&q=education"><svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="m2 10 12-5 12 5-12 5zM7 13v7c4 3 10 3 14 0v-7M25 11v8"/></svg><strong>Open textbooks</strong><span>Open Textbook Library</span></Link>
        {!isContentSourceRetired('storyweaver')&&(import.meta.env.VITE_CHILDREN_PILOT_ENABLED==='true'?<Link to="/app/search?scope=free&collection=children"><OpenBookIcon/><strong>Children’s stories</strong><span>Reviewed set · pilot</span></Link>:<span aria-disabled="true"><OpenBookIcon/><strong>Children’s stories</strong><span>Reviewed starter set · not enabled yet</span></span>)}
        <Link to="/app/search?scope=papers"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 2h9l5 5v15H5zM14 2v6h5M9 12h6M9 16h6"/></svg><strong>Research papers</strong><span>Open-access journals, preprints</span></Link></div>
        {recentSearches.size>0&&<section className="content-recents"><h2 className="content-section-label">Recent free searches</h2><ul>{Array.from(recentSearches.values()).reverse().map(recent=><li key={recent.href}><Link to={recent.href}><span aria-hidden="true">◷</span><span>{recent.query}</span>{recent.scope==='papers'&&<small>Papers</small>}</Link></li>)}</ul></section>}</div>:<>
      {(children||language||kind||level||(!busy&&!error&&!failed.length&&!!page?.items.length))&&<div className="content-filters">{children?<div className="content-languages" role="group" aria-label="Language">{[['','All languages'],['en','English'],['hi','हिन्दी'],['ta','தமிழ்']].map(([value,label])=><button key={value} type="button" lang={value||undefined} aria-pressed={language===value} onClick={()=>setLanguage(value)}>{label}</button>)}</div>:<label><span className="visually-hidden">Language</span><select aria-label="Language" value={searchLanguage} disabled={scope==='papers'} aria-describedby={scope==='papers'?'content-language-help':undefined} title={scope==='papers'?'Language filtering across paper sources is not available yet.':undefined} onChange={e=>setLanguage(e.target.value)}>
        <option value="">All languages</option><option value="en">English</option><option value="hi" lang="hi">हिन्दी</option><option value="ta" lang="ta">தமிழ்</option></select></label>}
        {scope==='papers'&&<span className="visually-hidden" id="content-language-help">Language filtering across paper sources is not available yet.</span>}
        {!children&&<button type="button" disabled title={scope==='papers'?'Year filtering across paper sources is not available yet.':'Format filtering is not available for these sources yet.'} aria-describedby="content-format-help">{scope==='papers'?'Any year':'All formats'}</button>}
        <span id="content-format-help" className="visually-hidden">{scope==='papers'?'Year filtering across paper sources is not available yet.':'Format filtering is not available for these sources yet.'}</span>
        {!children&&!textbooks&&<label><span className="visually-hidden">Content type</span><select aria-label="Content type" value={kind} onChange={event=>setKind(event.target.value)}><option value="">{scope==='papers'?'All types':'Books and stories'}</option>{(scope==='papers'?[['article','Articles'],['preprint','Preprints'],['chapter','Chapters'],['thesis','Theses'],['report','Reports']]:[['book','Books'],['learning_resource','Learning resources']]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
        {children&&<label><span className="visually-hidden">Publisher level</span><select aria-label="Publisher level" value={level} disabled={!page?.availableLevels?.length} onChange={e=>setLevel(e.target.value)}><option value="">All publisher levels</option>{page?.availableLevels?.map(label=><option key={label} value={label}>{label}</option>)}</select></label>}
      </div>}
      {children&&<p className="content-coverage">Levels are as the publisher labels them; they do not imply an age.</p>}
      {textbooks&&<p className="content-coverage">Open textbooks · <Link to={'/app/search?scope=free&q='+encodeURIComponent(query)}>Search all free books</Link>. This catalog export does not supply languages; a language filter excludes those records.</p>}
      {busy&&<div className="content-loading" role="status"><p className="visually-hidden">Checking sources…</p><ul className="content-source-list">{progress.map(source=><li key={source.id}><span><span className={source.status==='ok'?'access-free':undefined} aria-hidden="true">{source.status==='ok'?'✓':source.status==='queued'?'–':'○'}</span>{' '}{sourceName(source)}</span><span>{source.status==='ok'?(source.returned?`${source.returned} found`:'Answered'):sourceStatus(source)}</span></li>)}</ul><p>{m.loading}</p><div className="content-skeletons" aria-hidden="true"><span/><span/><span/></div></div>}
      {error&&<div className={'content-notice content-outage'+(disabled||restartRequired?' content-disabled':'')} role="alert">{disabled||restartRequired?<OpenBookIcon/>:<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m3 3 18 18M2 8c5-5 15-5 20 0M5 12c3-3 11-3 14 0M8 16c2-2 6-2 8 0M12 20h.01"/></svg>}<h2>{errorTitle}</h2><p>{disabled&&scope==='papers'?'Choose a connected source in Sources, open a source website, or search free books.':error.message}</p>
        {!disabled&&!restartRequired&&<p>This does not mean there is no free copy.</p>}<div className="content-outage-actions">{disabled?scope==='papers'&&<Link className="button-link" to={'/app/search?'+new URLSearchParams({scope:'free',q:query})}>Search free books instead</Link>:<button onClick={again}>{restartRequired?'Search again':'Try again'}</button>}<Link className="button-link button-quiet" to={'/app/search?q='+encodeURIComponent(query)}>Search library books instead</Link></div>
        {sources.length>0&&<button className="text-button" onClick={()=>setSourcesOpen(true)}>Sources</button>}</div>}
      {page&&<div className={'content-results-layout'+(desktop&&selected?' has-detail':'')}><div className="content-results">
        {page.searchMode==='live'&&<p className="content-coverage">Searching {answered.map(sourceName).join(', ')||'the selected source'} live. One source per search; use Sources to switch. Results can change between pages.</p>}
        {interrupted.length>0&&<div className="content-notice"><h2>{interrupted.length===1?`${sourceName(interrupted[0])} ${interrupted[0].status==='timeout'?'didn’t answer in time':'could not answer'}`:'Some sources could not answer'}</h2><p>Other results are shown. These sources may have more matches.</p>{page.sessionCursor&&interrupted.filter(s=>s.retryable).map(source=><button className="text-button" key={source.id} disabled={busy} onClick={()=>void load(page.sessionCursor,source.id)}>Try {sourceName(source)} again</button>)}</div>}
        {page.sources.some(s=>s.id==='openalex'&&s.status==='quota_exhausted')&&<div className="content-notice"><h2>{m.quotaTitle}</h2><p>{m.quotaDetail}</p></div>}
        {page.sources.some(s=>s.freshness==='stale')&&<p className="content-notice">These source details need refreshing. Older reading links are marked unclear.</p>}
        {(page.items.length>0||failed.length>0||page.hiddenUnclear>0)&&<div className="content-count"><span><span>{free.length+account.length} {scope==='papers'?(free.length+account.length===1?'paper':'papers'):(free.length+account.length===1?'free book':'free books')} shown</span>{answered.length>0&&<> · {failed.length?`${answered.length} of ${searched.length} sources answered`:(answered.some(source=>source.returned>0)?answered.filter(source=>source.returned>0):answered).map(sourceName).join(' · ')}</>}</span><button className="text-button" onClick={()=>setSourcesOpen(true)}>Sources</button></div>}
        {page.sources.some(s=>s.complete===false)&&<p className="content-coverage">Searching limited catalog snapshots{page.sources.some(s=>s.catalogRecords)?` with ${page.sources.reduce((sum,s)=>sum+(s.catalogRecords||0),0).toLocaleString()} records`:''}. Source coverage varies.</p>}
          <div className={children?'content-children-grid':undefined}>{free.map(item=><ContentResult key={item.key} item={item} to={itemLink(item.key)} returnTo={returnTo} selected={selected===item.key}/>)}</div>
          {account.length>0&&<section aria-label="Free account required"><h2 className="content-section-label">Free account required</h2><p className="content-coverage">{m.sourceAccount}</p><div className={children?'content-children-grid':undefined}>{account.map(item=><ContentResult key={item.key} item={item} to={itemLink(item.key)} returnTo={returnTo} selected={selected===item.key}/>)}</div></section>}
          {page.hiddenUnclear>0&&<div className="content-unclear-notice"><strong>{page.hiddenUnclear} {page.hiddenUnclear===1?'result has':'results have'} unclear access</strong><p>{m.unclear}</p><button className="text-button" onClick={()=>setUnclear(!unclear)}>{unclear?'Hide them':'Show them, labelled'}</button></div>}
          {!busy&&!error&&!failed.length&&!page.items.length&&<div className="content-empty"><h2>No verified free copy in these results</h2><p>{page.hiddenUnclear?'Some records need clearer access evidence.':'These sources answered but did not return a free copy for this search.'}</p>
            <Link className="button-link" to={library?'/app/search?q='+encodeURIComponent(query):'/app/libraries'}>{library?'Check your library':'Choose a library'}</Link><h3 className="content-section-label">Searched</h3><ul className="content-source-list">{answered.map(source=><li key={source.id}><span>{sourceName(source)}</span><span>0 matches</span></li>)}</ul></div>}
          {unknown.length>0&&<section aria-label="Unclear access"><h2>Unclear access</h2>{unknown.map(item=><ContentResult key={item.key} item={item} to={itemLink(item.key)} returnTo={returnTo}/>)}</section>}
          {page.nextCursor&&<button disabled={busy} onClick={()=>void load(page.nextCursor!)}>Show more</button>}
        </div>{desktop&&selected&&<aside className="content-selected"><ContentDetail contentKey={selected} returnTo={returnTo}/></aside>}</div>
      }
    </>}
    <Sheet open={sourcesOpen} title="Sources for this search" onClose={()=>setSourcesOpen(false)}><p className="content-coverage">For “{query}” in {scope==='papers'?'Papers':'Free to read'}. Counts describe the items loaded here.</p><ul className="content-source-list">{sources.map(source=><li key={source.id}><div><strong>{sourceName(source)}</strong>{source.scope&&<p className="content-coverage">{source.scope}</p>}</div><span>{sourceStatus(source)}</span>{source.status==='not_selected'&&scope==='papers'&&<Link to={'/app/search?'+new URLSearchParams({scope,q:query,source:source.id})} onClick={()=>setSourcesOpen(false)}>Search it</Link>}{scope==='papers'&&safeSource(source.searchUrl)&&<a href={safeSource(source.searchUrl)} target="_blank" rel="noopener noreferrer" aria-label={`Search ${sourceName(source)} website (opens source website)`}>Search website</a>}</li>)}</ul>
      <p>Sources can have different coverage. Counts describe the items loaded here.</p></Sheet>
  </section>;
}
