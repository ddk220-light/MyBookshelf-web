import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { contentApi } from '../../contentApi';
import type { ContentItem } from '../../contentTypes';
import { useLibrary } from '../../context';
import { ContentCover, kindLabel } from './ContentResult';
import './content.css';

const formats: Record<string,string> = {'application/pdf':'PDF','application/epub+zip':'EPUB','text/plain':'Plain text','text/html':'HTML','application/x-mobipocket-ebook':'Kindle'};
function safeSource(value: string): string | undefined {
  try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password ? u.href:undefined; } catch {return undefined;}
}
export function ContentDetail({ contentKey, returnTo = '/app/search?scope=free' }: { contentKey: string; returnTo?: string }) {
  const [item,setItem]=useState<ContentItem|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [retry,setRetry]=useState(0);
  const [notice,setNotice]=useState<string|null>(null);
  const {library,state,saveContent,unsaveContent,recoveryMode}=useLibrary();
  useEffect(()=>{
    const controller=new AbortController();setItem(null);setError(null);setNotice(null);
    contentApi.resolve(contentKey,controller.signal).then(next=>{if(!controller.signal.aborted)setItem(next);})
      .catch(()=>{if(!controller.signal.aborted)setError('We couldn’t check this item. That does not mean there is no free copy.');});
    return()=>controller.abort();
  },[contentKey,retry]);
  const back=returnTo.startsWith('/app/search')||returnTo.startsWith('/app/books/')||returnTo==='/app/shelf'?returnTo:'/app/search?scope=free';
  if(error)return <section className="content-detail"><Link className="back-link" to={back}>← Back</Link><h1>Couldn’t check this item</h1><p role="alert">{error}</p><button onClick={()=>setRetry(v=>v+1)}>Try again</button></section>;
  if(!item)return <section className="content-detail"><p role="status">Checking reading links…</p></section>;
  const saved=state.savedContent.some(value=>value.contentKey===item.key);
  const anonymous=item.readingActions.filter(action=>!action.requiresAccount);
  const preferred=anonymous.length?anonymous:item.readingActions;
  const primary=preferred.find(action=>item.locations.find(location=>location.id===action.locationId)?.readerUrl)||preferred[0];
  const downloads=(primary?.downloads||[]).filter((file,index,files)=>files.findIndex(other=>other.mimeType===file.mimeType)===index);
  const primaryLocation=item.locations.find(location=>location.id===primary?.locationId);
  const rights=primaryLocation?.license||(!primary?item.locations[0]?.license:undefined);
  const source=item.provenance[0];
  function save(){
    if(!item)return;
    if(saved){unsaveContent(item.key);setNotice('Removed from your shelf.');return;}
    const result=saveContent(item);
    setNotice(result==='full'?'Your shelf holds 100 items. Remove one to save this.':result==='recovery'?'Your shelf needs attention before this can be saved.':'Saved to your shelf in this browser.');
  }
  return <section className="content-detail">
    <Link className="back-link" to={back}>← Back</Link>
    <div className="content-detail-heading"><ContentCover title={item.title} kind={item.kind}/><div>
      <p className="content-kind">{kindLabel(item.kind)}{item.version?' · '+item.version:''}</p><h1 lang={item.languages[0]!=='und'?item.languages[0]:undefined}>{item.title}</h1>
      {item.flags?.includes('source_reports_retracted')&&<p className="content-warning">Retraction listed by source</p>}
      <p>{item.contributors.filter(c=>c.role==='author').map(c=>c.name).join(', ')}</p>
      {item.readingLevel&&<p>{item.readingLevel.publisher} · {item.readingLevel.label} (as the publisher labels it)</p>}{item.contributors.filter(c=>c.role!=='author').map(c=><p key={c.role+':'+c.name}>{c.role}: {c.name}</p>)}
      {item.container&&<p className="muted">{item.container.title}</p>}
      <button className="content-save" aria-pressed={saved} disabled={recoveryMode} onClick={save}>{saved?'Saved':'Save to shelf'}</button>
    </div></div>
    {notice&&<p role="status">{notice}</p>}
    {primary?.requiresAccount&&<p className="content-access access-free">Free account required at {primaryLocation?.host||'the source'}. Sign in there to read this book.</p>}
    {primary&&safeSource(primary.url)?<a className="button-link content-read" href={safeSource(primary.url)} target="_blank" rel="noopener noreferrer" aria-label={`${primary.label}${primary.requiresAccount?' · free account required':''} (opens ${primaryLocation?.host||'source'})`}>{primary.label} ↗</a>
      :<p className="content-access access-unclear">○ Access is unclear. Check the source for current reading options.</p>}
    {downloads.length>0&&<div className="content-formats" aria-label="Available formats">{downloads.map(file=>safeSource(file.url)&&<a key={file.url} href={safeSource(file.url)} target="_blank" rel="noopener noreferrer" aria-label={`${formats[file.mimeType]||'Format'} (opens ${new URL(file.url).hostname})`}>{formats[file.mimeType]||'Format'} ↗</a>)}</div>}
    <section className="content-rights"><h2>Reading and rights</h2><p>{rights?.statement||rights?.id||'Licence not stated.'}</p>
      {primaryLocation?.version&&<p>Version at this host: {primaryLocation.version}</p>}
      <p>Free to read does not always mean free to reuse. Check your country’s rules and the source’s terms.</p></section>
    {item.readingActions.length>1&&<section aria-label="Other free reading locations"><h2>Other free reading locations</h2>{item.readingActions.filter(action=>action!==primary).map(action=>{
      const location=item.locations.find(location=>location.id===action.locationId);
      const label=action.downloads.some(file=>file.mimeType==='application/pdf'&&file.url===action.url)?`Read PDF at ${location?.host||'source'}`:action.label;
      return <div key={action.locationId}><p><a href={safeSource(action.url)} target="_blank" rel="noopener noreferrer" aria-label={`${label} (opens ${location?.host||'source'})`}>{label} ↗</a></p>
        {action.requiresAccount&&<p>Free account required at {location?.host||'the source'}.</p>}{location?.version&&<p>Version at this host: {location.version}</p>}<p>{location?.license?.statement||location?.license?.id||'Licence not stated.'}</p></div>;
    })}</section>}
    {item.relations.length>0&&<section><h2>Related versions</h2>{item.relations.map(relation=><p key={relation.targetKey||relation.targetUrl}>{relation.targetKey?<Link to={'/app/read/'+encodeURIComponent(relation.targetKey)}>{relation.kind} · separate item</Link>:relation.targetUrl&&safeSource(relation.targetUrl)?<a href={safeSource(relation.targetUrl)} target="_blank" rel="noopener noreferrer">{relation.kind} ↗</a>:relation.kind}</p>)}</section>}
    {['book','learning_resource'].includes(item.kind)&&<p className="content-library-link"><Link to={'/app/search?q='+encodeURIComponent(item.title+' '+item.contributors.filter(c=>c.role==='author').slice(0,1).map(c=>c.name).join(' '))}>
      Prefer print? {library?`Search ${library.name}`:'Search library books'}</Link><small>A title search may find a different edition.</small></p>}
    {source&&<footer className="content-provenance">From {({bookdash:'Book Dash',gutenberg:'Project Gutenberg','open-textbook-library':'Open Textbook Library',europepmc:'Europe PMC',arxiv:'arXiv',doaj:'DOAJ',openalex:'Wide paper search'} as Record<string,string>)[source.sourceId]||source.sourceId} · checked {new Date(source.retrievedAt).toLocaleDateString()}
      {safeSource(source.recordUrl)&&<> · <a href={safeSource(source.recordUrl)} target="_blank" rel="noopener noreferrer" aria-label={`Source record (opens ${new URL(source.recordUrl).hostname})`}>Source record ↗</a></>}</footer>}
  </section>;
}

export function ContentDetailPage(){const {contentKey}=useParams();const location=useLocation();
  const returnTo=(location.state as {returnTo?:string}|null)?.returnTo;
  return <ContentDetail contentKey={contentKey||''} returnTo={returnTo}/>;}
