import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { contentApi } from '../../contentApi';
import { PublicApiError } from '../../api';
import { LibraryStateProvider } from '../../context';
import { ANONYMOUS_WEB_STORAGE_KEY } from '../../localState';
import type { ContentItem, ContentPage } from '../../contentTypes';
import { ContentDetail } from './ContentDetailPage';
import { ContentSearchPage } from './ContentSearchPage';
import { ShelfPage } from '../shelf/ShelfPage';
import { AlsoFree } from './AlsoFree';

const item:ContentItem={key:'fcd:v1:europepmc:MED:123',kind:'article',title:'Synthetic flow fixture',contributors:[{name:'Fixture Author',role:'author'}],
  identifiers:[],languages:['en'],subjects:[],access:'free_full_text',relations:[],
  locations:[{id:'html',host:'Europe PMC',landingUrl:'https://europepmc.org/articles/PMC123',readerUrl:'https://europepmc.org/articles/PMC123',access:'free_full_text',
    evidence:{sourceId:'europepmc',field:'OA location',observedAt:'2026-11-01T08:00:00Z'}}],
  provenance:[{sourceId:'europepmc',sourceRecordId:'MED:123',recordUrl:'https://europepmc.org/article/MED/123',retrievedAt:'2026-11-01T08:00:00Z'}],
  readingActions:[{locationId:'html',label:'Read at Europe PMC',url:'https://europepmc.org/articles/PMC123',downloads:[]}]};
const page:ContentPage={items:[item],nextCursor:null,hiddenUnclear:0,coverage:'partial',policyRevision:'test',sources:[{id:'europepmc',name:'Europe PMC',status:'ok',returned:1,scope:'Biomedical literature'}]};
const legacyBook={bookKey:'v1:isbn:9780140328721',title:'Existing shelf book',authors:['Legacy Author'],source:'direct',viewedAt:'2026-10-01T00:00:00Z'};
function mount(ui:React.ReactNode,path='/app/search?scope=papers&q=flow-fixture') {return render(<MemoryRouter initialEntries={[path]}><LibraryStateProvider>{ui}</LibraryStateProvider></MemoryRouter>);}
beforeEach(()=>{localStorage.clear();vi.spyOn(contentApi,'resolve').mockResolvedValue(structuredClone(item));vi.spyOn(contentApi,'search').mockResolvedValue(structuredClone(page));});
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();});

it('saves a paper, reloads the mixed shelf and removes it without losing a legacy book',async()=>{
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY,JSON.stringify({version:1,selectedLibraryId:null,recentBooks:[],savedBooks:[legacyBook]}));
  const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Unexpected network request'));
  const first=mount(<ContentDetail contentKey={item.key}/>);
  await screen.findByRole('heading',{name:item.title});fireEvent.click(screen.getByRole('button',{name:'Save to shelf'}));
  expect(screen.getByRole('button',{name:'Saved'})).toHaveAttribute('aria-pressed','true');
  let saved=JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!);
  expect(saved.version).toBe(2);expect(saved.savedBooks).toEqual([legacyBook]);expect(saved.savedContent[0].contentKey).toBe(item.key);
  first.unmount();mount(<ShelfPage/>,'/app/shelf');
  expect(screen.getByRole('heading',{name:'Free books and papers'})).toBeInTheDocument();
  expect(screen.getByRole('link',{name:/Synthetic flow fixture/})).toHaveAttribute('href','/app/read/fcd%3Av1%3Aeuropepmc%3AMED%3A123');
  fireEvent.click(screen.getByRole('button',{name:'Edit'}));fireEvent.click(screen.getByRole('button',{name:`Remove ${item.title} from shelf`}));
  saved=JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!);expect(saved.savedContent).toEqual([]);expect(saved.savedBooks).toEqual([legacyBook]);
  expect(fetch).not.toHaveBeenCalled();
});

it('labels absent licence and opens only the supplied source action',async()=>{
  mount(<ContentDetail contentKey={item.key}/>);
  expect(await screen.findByText('Licence not stated.')).toBeInTheDocument();
  const read=screen.getByRole('link',{name:'Read at Europe PMC (opens Europe PMC)'});
  expect(read).toHaveAttribute('href','https://europepmc.org/articles/PMC123');expect(read).toHaveAttribute('rel','noopener noreferrer');
});

it('keeps textbook collection searches distinct and labels the catalog language gap',async()=>{
  const textbook:ContentItem={...item,key:'fcd:v1:open-textbook-library:123',kind:'learning_resource',title:'Synthetic textbook fixture',languages:['und'],
    provenance:[{...item.provenance[0],sourceId:'open-textbook-library',sourceRecordId:'123'}]};
  vi.mocked(contentApi.search).mockResolvedValue({...page,items:[textbook],sources:[{id:'open-textbook-library',status:'ok',returned:1,complete:false,catalogRecords:1909}]});
  mount(<ContentSearchPage scope="free"/>,'/app/search?scope=free&collection=textbooks&q=textbook-fixture');
  await screen.findByRole('heading',{name:textbook.title});
  const calls=vi.mocked(contentApi.search).mock.calls;
  expect(calls[calls.length-1]?.[1]).toEqual(['learning_resource']);
  expect(screen.getByText(/does not supply languages/)).toBeInTheDocument();
  expect(screen.getByText(/1,909 records/)).toBeInTheDocument();
});

it('shows source progress then retries one failed source without losing the answered results',async()=>{
  let answer:((value:ContentPage)=>void)|undefined;
  const extra:ContentItem={...item,key:'fcd:v1:doaj:'+ 'b'.repeat(32),title:'Retried source fixture',provenance:[{...item.provenance[0],sourceId:'doaj'}]};
  vi.mocked(contentApi.search).mockImplementation(async(_q,_k,options,_signal,progress)=>{
    if(options?.retrySource)return {...page,items:[extra],sessionCursor:'retry-token',sources:[page.sources[0],{id:'doaj',status:'ok',returned:1}]};
    progress?.({id:'doaj',status:'searching',returned:0});
    return new Promise(resolve=>{answer=resolve;});
  });
  mount(<ContentSearchPage scope="papers"/>,'/app/search?scope=papers&q=progress-fixture');
  expect(await screen.findByText('Searching…')).toBeInTheDocument();
  answer!({...page,sessionCursor:'opaque-session-token',sources:[page.sources[0],{id:'doaj',status:'timeout',returned:0,retryable:true}]});
  await screen.findByRole('heading',{name:item.title});
  fireEvent.click(screen.getByRole('button',{name:'Try DOAJ again'}));
  expect(await screen.findByRole('heading',{name:extra.title})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:item.title})).toBeInTheDocument();
  const calls=vi.mocked(contentApi.search).mock.calls;
  expect(calls[calls.length-1][2]).toMatchObject({cursor:'opaque-session-token',retrySource:'doaj'});
});

it('a partial search with no readable items does not claim that every source found no free copy',async()=>{
  vi.mocked(contentApi.search).mockResolvedValue({...page,items:[],sources:[page.sources[0],{id:'doaj',status:'timeout',returned:0}]});
  mount(<ContentSearchPage scope="papers"/>,'/app/search?scope=papers&q=partial-empty-fixture');
  await screen.findByText('Some sources could not answer. Other results are shown.');
  expect(screen.queryByRole('heading',{name:'No verified free copy in these results'})).not.toBeInTheDocument();
});

it('the unpublished children collection reports its review gate even with no search query',async()=>{
  vi.mocked(contentApi.search).mockRejectedValue(new PublicApiError({code:'CONTENT_COLLECTION_UNAVAILABLE',status:503,message:'The reviewed children’s starter set is not ready yet.'}));
  mount(<ContentSearchPage scope="free"/>,'/app/search?scope=free&collection=children');
  expect(await screen.findByRole('heading',{name:'The starter set is still being checked'})).toBeInTheDocument();
  expect(screen.queryByRole('heading',{name:'No verified free copy in these results'})).not.toBeInTheDocument();
  const calls=vi.mocked(contentApi.search).mock.calls;
  expect(calls[calls.length-1][0]).toBe('');expect(calls[calls.length-1][2]).toMatchObject({collection:'children'});
});

it('pilot fixtures retain script, original credits and publisher levels while language filters change',async()=>{
  const story:ContentItem={...item,key:'fcd:v1:storyweaver:7777772',kind:'book',title:'हिन्दी परीक्षण कहानी',languages:['hi'],collections:['children'],
    publisher:'Fixture publisher',readingLevel:{publisher:'Fixture publisher',label:'Publisher level one'},
    contributors:[{name:'Fixture Author',role:'author'},{name:'Fixture Illustrator',role:'illustrator'},{name:'Fixture Translator',role:'translator'}]};
  vi.mocked(contentApi.search).mockImplementation(async(_q,_k,options)=>({...page,availableLevels:['Publisher level one'],sources:[{id:'children-pilot',status:'ok',returned:1}],
    items:[options?.languages?.[0]==='ta'?{...story,key:'fcd:v1:storyweaver:7777773',languages:['ta'],title:'தமிழ் சோதனைக் கதை'}:story]}));
  mount(<ContentSearchPage scope="free"/>,'/app/search?scope=free&collection=children&q=pilot-ui-fixture');
  expect(await screen.findByRole('heading',{name:story.title})).toHaveAttribute('lang','hi');
  expect(screen.getByText('Illustrated by Fixture Illustrator')).toBeInTheDocument();
  expect(screen.getByText('Translated by Fixture Translator')).toBeInTheDocument();
  expect(screen.getByRole('option',{name:'Publisher level one'})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Language'),{target:{value:'ta'}});
  expect(await screen.findByRole('heading',{name:'தமிழ் சோதனைக் கதை'})).toHaveAttribute('lang','ta');
  fireEvent.change(screen.getByLabelText('Publisher level'),{target:{value:'Publisher level one'}});
  await waitFor(()=>{const calls=vi.mocked(contentApi.search).mock.calls;expect(calls[calls.length-1][2]).toMatchObject({collection:'children',languages:['ta'],level:'Publisher level one'});});
});

it('shows unknown items only after explicit consent and keeps source states inspectable',async()=>{
  vi.mocked(contentApi.search).mockImplementation(async(_q,_k,options)=>({...page,hiddenUnclear:1,
    items:options?.includeUnclear?[item,{...item,key:'fcd:v1:europepmc:MED:124',title:'Unknown-access fixture',access:'unknown',readingActions:[]}]:[item]}));
  mount(<ContentSearchPage scope="papers"/>,'/app/search?scope=papers&q=unclear-fixture');
  await screen.findByRole('heading',{name:item.title});expect(screen.queryByRole('heading',{name:'Unknown-access fixture'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Show them, labelled'}));
  expect(await screen.findByRole('heading',{name:'Unknown-access fixture'})).toBeInTheDocument();
  expect(screen.getByText('Access unclear · check at the source')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Sources'}));expect(screen.getByRole('dialog',{name:'Sources for this search'})).toBeVisible();
});

it('source outage is an alert rather than a zero-result claim',async()=>{
  vi.mocked(contentApi.search).mockRejectedValue(new PublicApiError({code:'CONTENT_UNAVAILABLE',message:'The paper source timed out.',status:503,
    sources:[{id:'europepmc',status:'timeout',returned:0}]}));
  mount(<ContentSearchPage scope="papers"/>,'/app/search?scope=papers&q=outage-fixture');
  await screen.findByRole('alert');expect(screen.getByText('This does not mean there is no free copy.')).toBeInTheDocument();
  expect(screen.queryByText('No verified free copy in these results')).not.toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Search library books instead'})).toHaveAttribute('href','/app/search?q=outage-fixture');
});

it('wide-index daily limit keeps specialist results and avoids provider branding',async()=>{
  vi.mocked(contentApi.search).mockResolvedValue({...page,sources:[...page.sources,{id:'openalex',status:'quota_exhausted',returned:0}]});
  mount(<ContentSearchPage scope="papers"/>,'/app/search?scope=papers&q=quota-fixture');
  expect(await screen.findByText('Wide paper search is at today’s limit. Other source results are shown.')).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:item.title})).toBeInTheDocument();expect(screen.queryByText(/OpenAlex/)).not.toBeInTheDocument();
});

it('library free-edition cards require exact evidence and fail quietly when it is absent',async()=>{
  const locate=vi.spyOn(contentApi,'locate').mockResolvedValue([{...item,match:{scheme:'isbn13',value:'9780140328721'}}]);
  const first=mount(<AlsoFree book={{...legacyBook,isbn13:'9780140328721'}}/>);
  expect(await screen.findByRole('heading',{name:'Also free to read'})).toBeInTheDocument();
  expect(screen.getByText('The source offers a related book. It may be a different edition.')).toBeInTheDocument();first.unmount();
  locate.mockResolvedValue([{...item,match:{scheme:'isbn13',value:'9780142410363'}}]);
  const second=mount(<AlsoFree book={{...legacyBook,isbn13:'9780140328721'}}/>);
  await waitFor(()=>expect(locate).toHaveBeenCalledTimes(2));expect(screen.queryByRole('heading',{name:'Also free to read'})).not.toBeInTheDocument();second.unmount();
  locate.mockRejectedValue(new Error('offline'));mount(<AlsoFree book={{...legacyBook,isbn13:'9780140328721'}}/>);
  await waitFor(()=>expect(locate).toHaveBeenCalledTimes(3));expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
