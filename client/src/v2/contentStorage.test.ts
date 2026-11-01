import { describe, expect, it } from 'vitest';
import { ANONYMOUS_WEB_STORAGE_KEY, emptyState, readAnonymousWebStateWithStatus, withSavedBook, withSavedContent, writeAnonymousWebState } from './localState';
import type { ContentItem } from './contentTypes';
const item:ContentItem={key:'fcd:v1:europepmc:MED:123',kind:'article',title:'Synthetic storage fixture',contributors:[{name:'Test Author',role:'author'}],identifiers:[],languages:['en'],subjects:[],locations:[],provenance:[],relations:[],readingActions:[],access:'unknown'};
const book={bookKey:'v1:isbn:9780140328721',title:'Existing book',authors:['Existing Author'],source:'direct',viewedAt:'2026-10-01T00:00:00Z'};
class Store{value:string|null=null;getItem(){return this.value;}setItem(_:string,value:string){this.value=value;}removeItem(){this.value=null;}}
describe('tagged free-content browser shelf',()=>{
  it('reads legacy v1 without rewriting, then migrates losslessly on a confirmed save',()=>{
    const storage=new Store();const raw=JSON.stringify({version:1,selectedLibraryId:'library-id',recentBooks:[book],savedBooks:[book]});storage.value=raw;
    const loaded=readAnonymousWebStateWithStatus(storage);expect(loaded.status).toBe('ok');expect(storage.value).toBe(raw);
    const next=withSavedContent(loaded.state,item,'2026-11-01T00:00:00Z');
    expect(writeAnonymousWebState(next,storage)).toBe(true);
    const reopened=readAnonymousWebStateWithStatus(storage);expect(reopened.state.version).toBe(2);
    expect(reopened.state.savedBooks).toEqual([book]);expect(reopened.state.recentBooks).toEqual([book]);
    expect(reopened.state.selectedLibraryId).toBe('library-id');expect(reopened.state.savedContent[0].contentKey).toBe(item.key);
    expect(reopened.state.savedContent[0]).not.toHaveProperty('bookKey');expect(reopened.state.savedContent[0]).not.toHaveProperty('isbn13');
  });
  it('enforces one 100-item cap without truncating or reordering saved books',()=>{
    let state=emptyState();for(let i=0;i<99;i++)state=withSavedBook(state,{...book,bookKey:'v1:googlebooks:'+i});
    state=withSavedContent(state,item);expect(state.savedContent).toHaveLength(1);
    expect(withSavedBook(state,{...book,bookKey:'v1:googlebooks:extra'})).toBe(state);
    expect(withSavedContent(state,{...item,key:'fcd:v1:gutenberg:11'})).toBe(state);
    expect(withSavedContent(state,item)).toBe(state);
  });
  it('keeps the original legacy object when migration persistence fails',()=>{
    const storage=new Store();storage.value=JSON.stringify({version:1,recentBooks:[],savedBooks:[book]});
    const original=storage.value;const next=withSavedContent(readAnonymousWebStateWithStatus(storage).state,item);
    const failing={getItem:()=>storage.value,setItem:()=>{throw Error('quota');},removeItem:()=>undefined};
    expect(writeAnonymousWebState(next,failing)).toBe(false);expect(storage.value).toBe(original);
  });
  it('marks damaged content as corrupt without overwriting the stored object',()=>{
    const storage=new Store();storage.value=JSON.stringify({version:2,recentBooks:[],savedBooks:[book],savedContent:[{kind:'content',contentKey:'javascript:x'}]});
    const original=storage.value;const result=readAnonymousWebStateWithStatus(storage);
    expect(result.status).toBe('corrupt');expect(result.state.savedBooks).toEqual([book]);expect(storage.value).toBe(original);
    expect(ANONYMOUS_WEB_STORAGE_KEY).toBe('mybookshelf.anonymous-web.v1');
  });
});
