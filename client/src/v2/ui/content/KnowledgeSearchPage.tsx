import {useEffect,useRef,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {PublicApiError} from '../../api';
import {knowledgeSources,runKnowledgeSearch,searchKnowledgeSource,type KnowledgeSource} from '../../knowledgeSearch';
import type {ContentKind,ContentPage} from '../../contentTypes';
import {SearchScopes} from './ContentSearchPage';
import {ContentResult,kindLabel} from './ContentResult';
import {SearchIcon} from '../icons';
import {sourceStatus} from './presentation';
import './content.css';
type Row={source:KnowledgeSource;page?:ContentPage;error?:PublicApiError;busy:boolean;visible:number};
const kinds:ContentKind[]=['book','learning_resource','audiobook','article','preprint','chapter','thesis','report'];
export function KnowledgeSearchPage(){
  const location=useLocation(),navigate=useNavigate();const params=new URLSearchParams(location.search);
  const query=params.get('q')||'',sourceId=params.get('source')||'',language=params.get('language')||'';
  const includeUnclear=params.get('unclear')==='1';
  const requestedKind=params.get('kind')||'';const kind=kinds.includes(requestedKind as ContentKind)?requestedKind as ContentKind:undefined;
  const [input,setInput]=useState(query),[sources,setSources]=useState<KnowledgeSource[]|null>(null),[catalogError,setCatalogError]=useState(false),[retry,setRetry]=useState(0),[catalogRetry,setCatalogRetry]=useState(0),[rows,setRows]=useState<Row[]>([]);
  const current=useRef<AbortController|null>(null);
  useEffect(()=>{setInput(query);},[query]);
  useEffect(()=>{const request=new AbortController();setCatalogError(false);knowledgeSources(request.signal).then(s=>{if(!request.signal.aborted)setSources(s);}).catch(()=>{if(!request.signal.aborted)setCatalogError(true);});return()=>request.abort();},[catalogRetry]);
  useEffect(()=>{
    current.current?.abort();const request=new AbortController();current.current=request;
    const selected=(sources||[]).filter(s=>s.enabled&&(!sourceId||s.id===sourceId)&&(!kind||s.kinds.includes(kind))&&(!language||s.languages.includes(language)));
    setRows(query?selected.map(source=>({source,busy:true,visible:3})):[]);
    if(query&&selected.length)void runKnowledgeSearch(selected,{query,kind,language,includeUnclear},request.signal,(id,page,error)=>setRows(previous=>previous.map(row=>row.source.id===id?{...row,page,error,busy:false}:row)));
    return()=>request.abort();
  },[sources,query,sourceId,kind,language,includeUnclear,retry]);
  function change(next:Record<string,string>){const value=new URLSearchParams({scope:'knowledge',...query?{q:query}:{},...sourceId?{source:sourceId}:{},...kind?{kind}:{},...language?{language}:{},...includeUnclear?{unclear:'1'}:{}});for(const [k,v]of Object.entries(next)){if(v)value.set(k,v);else value.delete(k);}navigate('/app/search?'+value);}
  function submit(e:React.FormEvent){e.preventDefault();if(!input.trim())return;if(input.trim()===query)setRetry(v=>v+1);else change({q:input.trim()});}
  async function more(row:Row,restart=false){
    if(row.busy)return;
    if(!restart&&row.page&&row.visible<row.page.items.length){setRows(all=>all.map(r=>r.source.id===row.source.id?{...r,visible:r.visible+6}:r));return;}
    const request=current.current;if(!request||request.signal.aborted)return;
    const cursor=restart?undefined:row.page?.nextCursor||undefined;
    setRows(all=>all.map(r=>r.source.id===row.source.id?{...r,busy:true,error:undefined}:r));
    try{const result=await searchKnowledgeSource(row.source,{query,kind,language,includeUnclear},request.signal,cursor);if(request.signal.aborted)return;
      setRows(all=>all.map(r=>r.source.id===row.source.id?{...r,busy:false,error:undefined,visible:restart?3:r.visible+6,page:{...result,items:cursor?Array.from(new Map([...(r.page?.items||[]),...result.items].map(item=>[item.key,item])).values()):result.items}}:r));
    }catch(error){if(!request.signal.aborted)setRows(all=>all.map(r=>r.source.id===row.source.id?{...r,busy:false,error:error instanceof PublicApiError?error:new PublicApiError()}:r));}
  }
  const connected=sources?.filter(s=>s.enabled)||[],finished=rows.filter(r=>!r.busy).length,count=rows.reduce((sum,r)=>sum+(r.page?.items.length||0),0),busy=rows.some(r=>r.busy);
  const priority=(row:Row)=>row.page?.items.length?0:row.busy?1:row.error?2:3;
  const displayedRows=[...rows].sort((a,b)=>priority(a)-priority(b));
  const returnTo='/app/search'+location.search;
  return <section className="page-section content-search knowledge-search">
    <div className="content-search-header"><header className="page-heading"><h1>Search</h1></header>
      <form className="content-search-form" onSubmit={submit}><label className="visually-hidden" htmlFor="knowledge-query">Search all knowledge</label><input id="knowledge-query" type="search" maxLength={300} placeholder="Books, papers, audio and more" value={input} onChange={e=>setInput(e.target.value)}/><button type="submit" aria-label="Search"><SearchIcon/></button></form><SearchScopes scope="knowledge"/>
    </div>
    <p className="knowledge-intro">One search across books, research, audiobooks and learning resources. Read or listen on the original source.</p>
    <div className="knowledge-filters">
      <label>Source<select value={sourceId} onChange={e=>change({source:e.target.value})}><option value="">All connected sources{sources?` (${connected.length})`:''}</option>{sources?.map(s=><option key={s.id} value={s.id} disabled={!s.enabled}>{s.name}{!s.enabled?' · not connected':''}</option>)}</select></label>
      <label>Type<select value={kind||''} onChange={e=>change({kind:e.target.value})}><option value="">All types</option>{kinds.map(k=><option key={k} value={k}>{kindLabel(k)}</option>)}</select></label>
      <label>Language<select value={language} onChange={e=>change({language:e.target.value})}><option value="">Source default</option><option value="en">English</option><option value="hi">हिन्दी</option><option value="ta">தமிழ்</option></select></label>
    </div>
    <label className="knowledge-unclear"><input type="checkbox" checked={includeUnclear} onChange={e=>change({unclear:e.target.checked?'1':''})}/>Show items with unclear access, labelled</label>
    {language&&<p className="content-coverage">Searching sources that support this language filter. Other sources may also hold material in this language.</p>}
    {catalogError?<div className="content-notice" role="alert"><p>The source list could not be loaded.</p><button onClick={()=>setCatalogRetry(v=>v+1)}>Try again</button></div>:!sources?<p role="status">Loading connected sources…</p>:!query?<>
      <div className="content-browse">{[['mathematics','Mathematics'],['agriculture','Agriculture'],['history','History'],['python','Programming']].map(([q,label])=><Link key={q} to={'/app/search?'+new URLSearchParams({scope:'knowledge',q})}><strong>{label}</strong><span>Explore across sources →</span></Link>)}</div>
      <h2 className="content-section-label">Connected sources</h2><ul className="knowledge-directory">{connected.map(s=><li key={s.id}><Link to={'/app/search?'+new URLSearchParams({scope:'knowledge',source:s.id})}>{s.name}</Link><p>{s.scope}</p></li>)}</ul><p className="content-coverage">Sources have different coverage and rights. Catalog snapshots can be incomplete or older; their access checks are labelled. More sources will appear as their integrations are verified.</p>
    </>:<>
      <p className="knowledge-progress" role="status" aria-live="polite">{count} results loaded · {finished} of {rows.length} sources finished{busy?' · still searching…':''}</p>
      {!rows.length&&<div className="content-notice"><h2>No connected source matches these filters</h2><p>Choose another source, type or language. This does not mean the information is unavailable.</p><button onClick={()=>change({source:'',kind:'',language:''})}>Search all connected sources</button></div>}
      {displayedRows.map(row=><section className="knowledge-source" key={row.source.id} aria-labelledby={'knowledge-'+row.source.id}>
        <header className="knowledge-source-heading"><div><h2 id={'knowledge-'+row.source.id}>{row.source.name}</h2><p>{row.source.scope}</p></div><span>{row.busy?'Searching…':row.error?'Could not finish':`${row.page?.items.length||0} loaded`}</span></header>
        {row.source.mode==='snapshot'&&<p className="content-coverage">Limited catalog snapshot. Older reading links may need checking at the source.</p>}
        {!includeUnclear&&Boolean(row.page?.hiddenUnclear)&&<p className="content-coverage">{row.page?.hiddenUnclear} additional items have unclear access. Turn on “Show items with unclear access” to see them.</p>}
        {row.error&&<div className="content-notice"><p>{row.error.message}</p>{row.error.sources?.filter(s=>s.id===row.source.id).map(s=><p key={s.id}>{sourceStatus(s)}</p>)}<button className="text-button" onClick={()=>void more(row,true)}>{row.error.code==='CONTENT_CURSOR_EXPIRED'?'Start this source again':`Retry ${row.source.name}`}</button></div>}
        {row.page?.items.slice(0,row.visible).map(item=><ContentResult key={item.key} item={item} to={'/app/read/'+encodeURIComponent(item.key)} returnTo={returnTo}/>)}
        {!row.busy&&!row.error&&row.page&&!row.page.items.length&&<p className="content-coverage">{row.page.hiddenUnclear?'No verified free matches returned. Matches needing an access check are hidden.':'No matches returned for this query.'}</p>}
        {row.page&&((row.visible<row.page.items.length)||row.page.nextCursor)&&<button disabled={row.busy} className="text-button knowledge-more" onClick={()=>void more(row)}>Show more from {row.source.name}</button>}
      </section>)}
      <p className="content-coverage">Results stay grouped by source to preserve editions, recordings and attribution. Sources may overlap. Search results can change between pages.</p>
    </>}
  </section>;
}
