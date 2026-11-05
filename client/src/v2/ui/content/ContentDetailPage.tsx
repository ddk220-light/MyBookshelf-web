import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { contentApi } from '../../contentApi';
import type { ContentItem } from '../../contentTypes';
import { useLibrary } from '../../context';
import { ContentCover, kindLabel } from './ContentResult';
import { BookmarkIcon, ExternalLinkIcon, LibraryIcon } from '../icons';
import { contentMessages as m } from '../../uiMessages';
import { checkedWhen, formatNames, primaryReadingAction, safeSource, sourceNames } from './presentation';
import './content.css';

const relationNames: Record<string, string> = {translation_of:'Original story',has_translation:'Translation',version_of:'Another version',
  has_version:'Another version',published_version:'Published version',is_preprint_of:'Published version',is_version_of:'Another version',
  audiobook:'Separate recording',transcription:'Different source text'};
export function ContentDetail({ contentKey, returnTo = '/app/search?scope=free' }: { contentKey: string; returnTo?: string }) {
  const [item,setItem]=useState<ContentItem|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [retry,setRetry]=useState(0);
  const [notice,setNotice]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
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
  const primary=primaryReadingAction(item);
  const downloads=(primary?.downloads||[]).filter((file,index,files)=>file.url!==primary?.url&&files.findIndex(other=>other.mimeType===file.mimeType)===index);
  const primaryLocation=item.locations.find(location=>location.id===primary?.locationId);
  const rights=primaryLocation?.license||(!primary?item.locations[0]?.license:undefined);
  const source=item.provenance[0];
  const name=sourceNames[source?.sourceId]||primaryLocation?.host||source?.sourceId;
  const languages=item.languages.filter(language=>language!=='und').map(language=>{
    try{return new Intl.DisplayNames(['en'],{type:'language'}).of(language)||language;}catch{return language;}
  });
  async function save(){
    if(!item||!saveContent||!unsaveContent||saving)return;
    setSaving(true);
    try{
      if(saved){setNotice(await unsaveContent(item.key)?'Removed from your shelf.':'Your shelf could not be changed. Try again.');return;}
      const result=await saveContent(item);
      setNotice(result==='full'?'Your shelf holds 100 items. Remove one to save this.':result==='recovery'?'Your shelf needs attention before this can be saved.':result==='failed'?'This item could not be saved. Try again.':'Saved to your shelf in this browser.');
    }finally{setSaving(false);}
  }
  return <section className="content-detail">
    <div className="content-toolbar"><Link className="back-link" to={back}>← {back==='/app/shelf'?'Shelf':back.includes('/app/books/')?'Book':back.includes('scope=papers')?'Papers':'Search'}</Link>
      <button className={'content-save'+(saved?' is-saved':'')} aria-label={saved?'Saved':'Save to shelf'} title={saved?'Remove from shelf':'Save to shelf'} aria-pressed={saved} aria-busy={saving} disabled={recoveryMode||saving||!saveContent} onClick={()=>void save()}><BookmarkIcon/></button></div>
    <div className="content-detail-heading">{['book','learning_resource'].includes(item.kind)&&<ContentCover title={item.title} kind={item.kind}/>}<div>
      {!['book','learning_resource'].includes(item.kind)&&<p className={'content-kind'+(item.kind==='preprint'?' content-preprint':'')}>{kindLabel(item.kind)}{item.version?' · '+item.version:''}</p>}
      <h1 lang={item.languages[0]!=='und'?item.languages[0]:undefined}>{item.title}</h1>
      {item.flags?.includes('source_reports_retracted')&&<p className="content-retraction">Retraction listed by source</p>}
      {item.flags?.includes('source_reports_correction')&&<p className="content-warning">Correction listed by source</p>}
      <p className="content-authors">{item.contributors.filter(c=>c.role==='author').map(c=>c.name).join(', ')}</p>
      {['book','learning_resource'].includes(item.kind)&&item.version&&<p className="content-record">{item.version}</p>}
      <p className="content-record">{name}{source?.sourceRecordId?` ${source.sourceId==='gutenberg'?'eBook #':''}${source.sourceRecordId}`:''}{languages.length?' · '+languages.join(', '):''}{item.publishedAt&&!['book','learning_resource'].includes(item.kind)?' · '+item.publishedAt.slice(0,4):''}</p>
      {item.readingLevel&&<p className="content-credit">{item.readingLevel.publisher} · {item.readingLevel.label} (as the publisher labels it)</p>}{item.contributors.filter(c=>c.role!=='author').map(c=><p className="content-credit" key={c.role+':'+c.name}>{c.role}: {c.name}</p>)}
      {item.container&&<p className="content-record">{item.container.title}</p>}
    </div></div>
    {notice&&<p role="status">{notice}</p>}
    {!saveContent&&<p className="content-record">Free books and papers can be saved in browser-only mode. They do not sync to an account yet.</p>}
    {primary&&!primary.requiresAccount&&<p className="content-access access-free"><span aria-hidden="true">● </span>{item.kind==='audiobook'?'Free to listen':'Free to read'}{primaryLocation?.readerUrl?' online':''}</p>}
    {primary?.requiresAccount&&<p className="content-access access-free">Free account required at {primaryLocation?.host||'the source'}. Sign in there to read this book.</p>}
    {primary&&safeSource(primary.url)?<a className="button-link content-read" href={safeSource(primary.url)} target="_blank" rel="noopener noreferrer" aria-label={`${primary.label}${primary.requiresAccount?' · free account required':''} (opens ${primaryLocation?.host||'source'})`}>{primary.label} <ExternalLinkIcon/></a>
      :<p className="content-access access-unclear">○ Access is unclear. Check the source for current reading options.</p>}
    {downloads.length>0&&<div className="content-formats" aria-label="Available formats">{downloads.map(file=>safeSource(file.url)&&<a key={file.url} href={safeSource(file.url)} target="_blank" rel="noopener noreferrer" aria-label={`${formatNames[file.mimeType]||'Format'} (opens ${new URL(file.url).hostname})`}>{formatNames[file.mimeType]||'Format'} <ExternalLinkIcon/></a>)}</div>}
    {primary&&safeSource(primary.url)&&<p className="content-host-note">Opens {new URL(primary.url).hostname}. {['book','learning_resource'].includes(item.kind)?m.noHost:'MyBookshelf doesn’t host or download this content.'}</p>}
    <section className="content-rights"><h2>Reading and rights</h2><p className="content-license">{rights?.statement||rights?.id||'Licence not stated.'}</p>
      {primaryLocation?.version&&<p>Version at this host: {primaryLocation.version}</p>}
      <p>{m.rights}</p>
      {primaryLocation&&<p className="content-record">From {primaryLocation.host} · checked {checkedWhen(primaryLocation.evidence.observedAt)}</p>}</section>
    {item.readingActions.length>1&&<section aria-label="Other free reading locations"><h2>Other free reading locations</h2>{item.readingActions.filter(action=>action!==primary).map(action=>{
      const location=item.locations.find(location=>location.id===action.locationId);
      const label=action.downloads.some(file=>file.mimeType==='application/pdf'&&file.url===action.url)?`Read PDF at ${location?.host||'source'}`:action.label;
      return <div key={action.locationId}>{action.requiresAccount&&<p>Free account required at {location?.host||'the source'}.</p>}<p><a href={safeSource(action.url)} target="_blank" rel="noopener noreferrer" aria-label={`${label}${action.requiresAccount?' · free account required':''} (opens ${location?.host||'source'})`}>{label} <ExternalLinkIcon/></a></p>
        {location?.version&&<p>Version at this host: {location.version}</p>}<p>{location?.license?.statement||location?.license?.id||'Licence not stated.'}</p></div>;
    })}</section>}
    {item.relations.length>0&&<section className="content-relations"><h2>Related versions</h2>{item.relations.map(relation=>{
      const label=relationNames[relation.kind]||relation.kind.replace(/_/g,' ');
      return <div key={relation.targetKey||relation.targetUrl||relation.kind}>{relation.targetKey?<Link to={'/app/read/'+encodeURIComponent(relation.targetKey)} state={{returnTo:back}}>{label} · separate item →</Link>:relation.targetUrl&&safeSource(relation.targetUrl)?<a href={safeSource(relation.targetUrl)} target="_blank" rel="noopener noreferrer" aria-label={`${label} (opens ${new URL(relation.targetUrl).hostname})`}>{label} at {new URL(relation.targetUrl).hostname} <ExternalLinkIcon/></a>:label}<p className="content-record">This is a separate item. Its text, access and licence may differ.</p></div>;
    })}</section>}
    {['book','learning_resource'].includes(item.kind)&&<p className="content-library-link"><Link to={'/app/search?q='+encodeURIComponent(item.title+' '+item.contributors.filter(c=>c.role==='author').slice(0,1).map(c=>c.name).join(' '))}>
      <LibraryIcon/>Prefer print? {library?`Search ${library.name}`:'Search library books'}</Link><small>A title search may find a different edition.</small></p>}
    {source&&<footer className="content-provenance">Found via {name} · checked {checkedWhen(source.retrievedAt)}
      {safeSource(source.recordUrl)&&<> · <a href={safeSource(source.recordUrl)} target="_blank" rel="noopener noreferrer" aria-label={`Source record (opens ${new URL(source.recordUrl).hostname})`}>Source record <ExternalLinkIcon/></a></>}</footer>}
  </section>;
}

export function ContentDetailPage(){const {contentKey}=useParams();const location=useLocation();
  const returnTo=(location.state as {returnTo?:string}|null)?.returnTo;
  return <ContentDetail contentKey={contentKey||''} returnTo={returnTo}/>;}
