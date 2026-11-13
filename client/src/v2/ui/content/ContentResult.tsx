import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { ContentItem, SavedContent } from '../../contentTypes';
import { formatNames, primaryReadingAction, sourceNames, safeSource } from './presentation';
import { OpenBookIcon } from '../icons';

export function kindLabel(kind: string) { return ({article:'Article',preprint:'Preprint',chapter:'Chapter',book:'Book',learning_resource:'Learning resource',thesis:'Thesis',report:'Report',other:'Maps, data and media',audiobook:'Audiobook'} as Record<string,string>)[kind] || 'Item'; }
function bookLike(kind:string){return kind==='book'||kind==='learning_resource';}
export function ContentCover({ title, kind, unclear = false }: { title: string; kind: string; unclear?: boolean }) {
  const colors=['#7b3e31','#315340','#3d4f7a','#65537a'];
  const color=colors[Array.from(title).reduce((sum,letter)=>sum+letter.charCodeAt(0),0)%colors.length];
  return <span className={`content-cover ${unclear?'content-unknown-cover':bookLike(kind) ? 'content-book-cover' : 'content-paper-cover'}`} style={{'--content-cover-color':color} as CSSProperties} aria-hidden="true">{unclear?<OpenBookIcon/>:<>{!bookLike(kind)&&<small>{kindLabel(kind)}</small>}<strong>{title}</strong></>}</span>;
}
export function ContentResult({ item, to, returnTo, selected = false }: { item: ContentItem; to: string; returnTo: string; selected?: boolean }) {
  const authors = item.contributors.filter(c => c.role === 'author');
  const primary = primaryReadingAction(item);
  const external=item.externalOnly&&safeSource(item.sourceActions?.[0]?.url);
  const host = item.locations.find(location => location.id === primary?.locationId)?.host || item.locations[0]?.host || 'Source';
  const index = sourceNames[item.provenance[0]?.sourceId];
  const formats = [...new Set((primary?.downloads || []).map(file => formatNames[file.mimeType]).filter(Boolean))];
  const readableFormats = [item.kind==='audiobook'?'Listen online':bookLike(item.kind) ? 'Read online' : 'HTML', ...formats.filter(format => format !== 'HTML')];
  if (!item.locations.find(location => location.id === primary?.locationId)?.readerUrl) readableFormats.shift();
  return <article className={'content-result' + (selected ? ' is-selected' : '')}>
    {bookLike(item.kind) && (external?<a tabIndex={-1} aria-hidden="true" href={external} target="_blank" rel="noopener noreferrer"><ContentCover title={item.title} kind={item.kind}/></a>:<Link tabIndex={-1} aria-hidden="true" to={to} state={{returnTo}}><ContentCover title={item.title} kind={item.kind} unclear={item.access==='unknown'&&!item.sourceActions?.length} /></Link>)}
    <div>{!bookLike(item.kind)&&<div className="content-pills"><span className={'content-kind' + (item.kind === 'preprint' ? ' content-preprint' : '')}>{kindLabel(item.kind)}{item.version ? ` · ${item.version}` : ''}</span>
      {item.flags?.includes('source_reports_retracted') && <span className="content-kind content-retraction">Retraction listed by source</span>}
      {item.flags?.includes('source_reports_correction') && <span className="content-kind content-warning">Correction listed by source</span>}</div>}
      <h2 lang={item.languages[0]!=='und'?item.languages[0]:undefined}>{external?<a href={external} target="_blank" rel="noopener noreferrer" aria-label={`${item.title} (opens source ${item.sourceActions?.[0]?.scope==='search'?'search results':'record'})`}>{item.title}</a>:<Link to={to} state={{returnTo}} aria-current={selected?'true':undefined}>{item.title}</Link>}</h2>
      <p className="content-authors">{authors.slice(0,3).map(c=>c.name).join(', ')}{authors.length>3?` + ${authors.length-3}`:''}</p>
      {bookLike(item.kind)&&item.version&&<p className="content-record">{item.version}</p>}
      {item.searchMatch?.field==='subject'&&<p className="content-credit">Subject: {item.searchMatch.value}</p>}
      {item.readingLevel&&<p className="content-credit">{item.readingLevel.publisher} · {item.readingLevel.label}</p>}{item.contributors.filter(c=>['illustrator','translator'].includes(c.role)).map(c=><p key={c.role+':'+c.name} className="content-credit">{c.role==='illustrator'?'Illustrated by':'Translated by'} {c.name}</p>)}
      {item.collections?.includes('children')&&<p className="content-credit">{item.locations.find(location=>location.id===primary?.locationId)?.license?.id||'Licence not stated'}</p>}
      {item.container && <p className="muted">{item.container.title}{item.publishedAt ? ' · '+item.publishedAt.slice(0,4):''}</p>}
      <p className={`content-access ${item.access === 'unknown' ? 'access-unclear' : 'access-free'}`}><span aria-hidden="true">{item.access === 'unknown'?'○':'●'}</span>{' '}
        {item.accessNote || (item.access === 'free_account_required' ? `Free account required at ${host}` : item.access === 'free_full_text' ? index&&index.toLowerCase()!==host.toLowerCase()?`Free · Found via ${index}, read at ${host}`:`Free · ${readableFormats.length ? readableFormats.join(', ') + ' at ' : 'Read at '}${host}` : 'Access unclear · check at the source')}</p>
    </div>
  </article>;
}
