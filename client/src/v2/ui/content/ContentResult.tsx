import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { ContentItem, SavedContent } from '../../contentTypes';

export function kindLabel(kind: string) { return ({article:'Article',preprint:'Preprint',chapter:'Chapter',book:'Book',learning_resource:'Learning resource',thesis:'Thesis',report:'Report',audiobook:'Audiobook'} as Record<string,string>)[kind] || 'Item'; }
function bookLike(kind:string){return kind==='book'||kind==='learning_resource';}
export function ContentCover({ title, kind }: { title: string; kind: string }) {
  const colors=['#7b3e31','#315340','#3d4f7a','#65537a'];
  const color=colors[Array.from(title).reduce((sum,letter)=>sum+letter.charCodeAt(0),0)%colors.length];
  return <span className={`content-cover ${bookLike(kind) ? 'content-book-cover' : 'content-paper-cover'}`} style={{'--content-cover-color':color} as CSSProperties} aria-hidden="true">{!bookLike(kind)&&<small>{kindLabel(kind)}</small>}<strong>{title}</strong></span>;
}
export function ContentResult({ item, to, returnTo }: { item: ContentItem; to: string; returnTo: string }) {
  const authors = item.contributors.filter(c => c.role === 'author');
  const host = item.readingActions[0]?.label.replace(/^Read at /,'') || item.locations[0]?.host || 'Source';
  const index=({gutenberg:'Project Gutenberg',europepmc:'Europe PMC',doaj:'DOAJ',arxiv:'arXiv',openalex:'Wide paper search','open-textbook-library':'Open Textbook Library'} as Record<string,string>)[item.provenance[0]?.sourceId];
  return <article className="content-result">
    {bookLike(item.kind) && <Link tabIndex={-1} aria-hidden="true" to={to} state={{returnTo}}><ContentCover title={item.title} kind={item.kind} /></Link>}
    <div>{!bookLike(item.kind)&&<p className="content-kind">{kindLabel(item.kind)}{item.version ? ` · ${item.version}` : ''}
      {item.flags?.includes('source_reports_retracted') && <span className="content-warning"> · Retraction listed by source</span>}</p>}
      <h2><Link to={to} state={{returnTo}}>{item.title}</Link></h2>
      <p>{authors.slice(0,3).map(c=>c.name).join(', ')}{authors.length>3?` + ${authors.length-3}`:''}</p>
      {item.container && <p className="muted">{item.container.title}{item.publishedAt ? ' · '+item.publishedAt.slice(0,4):''}</p>}
      <p className={`content-access ${item.access === 'free_full_text' ? 'access-free' : 'access-unclear'}`}><span aria-hidden="true">{item.access === 'free_full_text'?'●':'○'}</span>{' '}
        {item.access === 'free_full_text' ? index&&index.toLowerCase()!==host.toLowerCase()?`Free · Found via ${index}, read at ${host}`:`Free to read at ${host}` : 'Access unclear · check at the source'}</p>
    </div>
  </article>;
}
export function SavedContentCard({ item, editing, disabled, onRemove }: { item: SavedContent; editing: boolean; disabled: boolean; onRemove:(key:string)=>void }) {
  return <article className="saved-content-card"><Link to={'/app/read/'+encodeURIComponent(item.contentKey)} state={{returnTo:'/app/shelf'}}>
    <ContentCover title={item.title} kind={item.itemKind}/><span><strong>{item.title}</strong><small>{item.authors.join(', ')}</small><small>{kindLabel(item.itemKind)} · {item.host}</small></span>
  </Link>{editing && <button className="text-button" disabled={disabled} onClick={()=>onRemove(item.contentKey)} aria-label={`Remove ${item.title} from shelf`}>Remove</button>}</article>;
}
