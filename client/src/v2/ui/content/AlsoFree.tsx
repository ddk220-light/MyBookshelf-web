import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { contentApi } from '../../contentApi';
import type { ContentItem } from '../../contentTypes';
import type { PublicBook } from '../../types';

export function AlsoFree({book}:{book:PublicBook}){
  const [items,setItems]=useState<ContentItem[]>([]);
  useEffect(()=>{
    setItems([]);
    if(!book.isbn13&&!book.workId)return;
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),2000);
    const workId=book.workId?.startsWith('/')?book.workId:book.workId?'/works/'+book.workId:undefined;
    contentApi.locate({...book.isbn13?{isbn13:book.isbn13}:{},...book.workId?{workId:book.workId}:{}},controller.signal)
      .then(results=>{if(!controller.signal.aborted)setItems(results.filter(item=>item.match&&item.access==='free_full_text'&&item.readingActions.length>0
        &&(item.match.scheme==='isbn13'&&item.match.value===book.isbn13||item.match.scheme==='openlibrary_work'&&item.match.value===workId)));})
      .catch(()=>{/* An optional free-edition lookup never changes circulation or displays an error. */})
      .finally(()=>clearTimeout(timeout));
    return()=>{controller.abort();clearTimeout(timeout);};
  },[book.bookKey,book.isbn13,book.workId]);
  if(!items.length)return null;
  return <section className="content-also-free" aria-labelledby="also-free-heading"><h2 id="also-free-heading">Also free to read</h2>
    <p>The source offers a related book. It may be a different edition.</p>
    <ul>{items.map(item=><li key={item.key}><Link to={'/app/read/'+encodeURIComponent(item.key)} state={{returnTo:'/app/books/'+encodeURIComponent(book.bookKey)}}>{item.title} · {item.readingActions[0].label}</Link></li>)}</ul>
  </section>;
}
