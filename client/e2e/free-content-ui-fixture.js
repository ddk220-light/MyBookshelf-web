// Deterministic UI evidence only. Papers/stories are explicitly synthetic; none
// of this module is shipped in the application or used as source-review evidence.
import { BOOK, installPublicV2Fixture } from './public-v2-fixture.js';

const observedAt='2026-11-01T15:00:00Z';
export function reviewBook(id=1342,title='Pride and Prejudice') {
  const url=`https://www.gutenberg.org/ebooks/${id}`;
  return {key:`fcd:v1:gutenberg:${id}`,kind:'book',title,contributors:[{name:'Jane Austen',role:'author'}],
    identifiers:[],languages:['en'],subjects:[],relations:[],access:'free_full_text',
    locations:[{id:'reader',host:'Project Gutenberg',landingUrl:url,readerUrl:url,access:'free_full_text',
      license:{statement:'Public domain in the USA.'},evidence:{sourceId:'gutenberg',field:'Synthetic UI evidence timestamp',observedAt}}],
    readingActions:[{locationId:'reader',label:'Read at Project Gutenberg',url,downloads:[
      {url:`${url}.epub3.images`,mimeType:'application/epub+zip'},
      {url:`${url}.kf8.images`,mimeType:'application/x-mobipocket-ebook'},
      {url:`https://www.gutenberg.org/ebooks/${id}.txt.utf-8`,mimeType:'text/plain'}]}],
    provenance:[{sourceId:'gutenberg',sourceRecordId:String(id),recordUrl:url,retrievedAt:observedAt}]};
}
export function reviewPaper(id='777777',title='Synthetic review: seasonal transmission and vaccine protection') {
  const item=reviewBook();const url=`https://europepmc.org/articles/PMC${id}`;
  return {...item,key:`fcd:v1:europepmc:PMC:${id}`,kind:'article',title,publishedAt:'2025-03-01',container:{title:'Synthetic review journal'},
    contributors:['A. Fixture','B. Example','C. Sample','D. Review','E. Test'].map(name=>({name,role:'author'})),
    locations:[{...item.locations[0],id:'oa',host:'Europe PMC',landingUrl:url,readerUrl:url,license:{id:'CC-BY-4.0'}}],
    readingActions:[{locationId:'oa',label:'Read at Europe PMC',url,downloads:[{url:url+'?pdf=1',mimeType:'application/pdf'}]}],
    provenance:[{sourceId:'europepmc',sourceRecordId:'PMC:'+id,recordUrl:url,retrievedAt:observedAt}]};
}
export function reviewPreprint() {
  const item=reviewPaper();const url='https://arxiv.org/abs/9999.99999v3';
  return {...item,key:'fcd:v1:arxiv:9999.99999v3',kind:'preprint',version:'v3',title:'Synthetic review: learning from sparse observations',
    container:undefined,locations:[{...item.locations[0],id:'arxiv',host:'arXiv',landingUrl:url,readerUrl:url,version:'v3'}],
    provenance:[{sourceId:'arxiv',sourceRecordId:'9999.99999v3',recordUrl:url,retrievedAt:observedAt}],
    readingActions:[{locationId:'arxiv',label:'Read at arXiv',url,downloads:[{url:'https://arxiv.org/pdf/9999.99999v3',mimeType:'application/pdf'}]}],
    relations:[{kind:'has_version',targetUrl:'https://arxiv.org/abs/9999.99999v2',evidence:'Synthetic source relation'},
      {kind:'published_version',targetUrl:'https://example.test/synthetic-published-version',evidence:'Synthetic source relation'}]};
}
export function reviewStory(language='en') {
  const item=reviewBook();const id={en:'7777771',hi:'7777772',ta:'7777773'}[language];
  const title={en:'Synthetic review story',hi:'हिन्दी परीक्षण कहानी',ta:'தமிழ் சோதனைக் கதை'}[language];
  const url=`https://storyweaver.org.in/en/stories/${id}-synthetic-review`;
  return {...item,key:`fcd:v1:storyweaver:${id}`,title,languages:[language],collections:['children'],access:'free_account_required',
    contributors:[{name:'Fixture Author',role:'author'},{name:'Fixture Illustrator',role:'illustrator'},...language!=='en'?[{name:'Fixture Translator',role:'translator'}]:[]],
    readingLevel:{publisher:'Synthetic fixture publisher',label:'Level 1'},
    locations:[{...item.locations[0],id:'story',host:'StoryWeaver',access:'free_account_required',landingUrl:url,readerUrl:undefined,license:{id:'CC-BY-4.0'}}],
    readingActions:[{locationId:'story',label:'Read at StoryWeaver',url,requiresAccount:true,downloads:[]}],
    provenance:[{sourceId:'storyweaver',sourceRecordId:id,recordUrl:url,retrievedAt:observedAt}],
    relations:language==='en'?[]:[{kind:'translation_of',targetKey:'fcd:v1:storyweaver:7777771',evidence:'Synthetic original story relation'}]};
}
export const reviewStates=['FreeStart','FreeBookResults','FreeBookDetail','LibraryBookFreeEdition','PaperResults','PaperDetail',
  'SourcesSheet','Loading','PartialCoverage','SourcesDown','NoFreeCopy','BudgetUsed','ChildrensPilot','DeskFreeSearch'];
export function reviewResponse(state,request={}) {
  const books=[reviewBook(),reviewBook(158,'Emma'),reviewBook(105,'Persuasion')];
  const papers=[reviewPreprint(),reviewPaper(),{...reviewPaper('777778','Synthetic review: a correction listed by its source'),flags:['source_reports_correction']}];
  const isPaper=['PaperResults','PaperDetail','SourcesSheet','Loading','PartialCoverage','BudgetUsed'].includes(state);
  let items=isPaper?papers:books;
  let sources=isPaper?[{id:'europepmc',status:'ok',returned:2,scope:'Biomedical literature'},{id:'arxiv',status:'ok',returned:1,scope:'Preprints'}]:[{id:'gutenberg',status:'ok',returned:3}];
  if(state==='SourcesSheet') sources=[...sources,{id:'doaj',status:'ok',returned:0,scope:'Open-access journals'},
    {id:'openalex',status:'not_selected',returned:0},{id:'biorxiv',name:'bioRxiv and medRxiv',status:'disabled',returned:0}];
  if(state==='PartialCoverage')sources=[{id:'europepmc',status:'ok',returned:2},
    {id:'arxiv',status:request.retrySource?'ok':'timeout',returned:request.retrySource?1:0,retryable:true}];
  if(state==='PartialCoverage'&&!request.retrySource)items=papers.slice(1);
  if(state==='BudgetUsed')sources=[...sources,{id:'openalex',status:'quota_exhausted',returned:0}];
  if(state==='NoFreeCopy'){items=[];sources=[{id:'gutenberg',status:'ok',returned:0},{id:'open-textbook-library',status:'ok',returned:0}];}
  if(state==='ChildrensPilot'){
    items=['en','hi','ta'].filter(language=>!request.languages?.length||request.languages.includes(language)).map(reviewStory);
    sources=[{id:'children-pilot',status:'ok',returned:items.length,complete:false,catalogRecords:3}];
  }
  const hiddenUnclear=['FreeBookResults','DeskFreeSearch'].includes(state)?1:0;
  if(hiddenUnclear&&request.includeUnclear)items=[...items,{...reviewBook(777777,'Synthetic access-unclear review fixture'),access:'unknown',readingActions:[]}];
  if(request.kinds?.length)items=items.filter(item=>request.kinds.includes(item.kind));
  return {items,sources,nextCursor:null,sessionCursor:'synthetic-review-session',hiddenUnclear,coverage:'partial',policyRevision:'synthetic-ui-fixture',availableLevels:['Level 1']};
}
export async function installContentReviewFixture(page,state,{loadingUrl}={}) {
  await installPublicV2Fixture(page);
  const calls=[];
  await page.route('**/api/v2/content/**',async route=>{
    const endpoint=new URL(route.request().url()).pathname.split('/').pop();const body=route.request().postDataJSON();calls.push({endpoint,body});
    if(endpoint==='search'&&state==='Loading'&&loadingUrl)return route.continue({url:loadingUrl});
    if(endpoint==='search'&&state==='SourcesDown')return route.fulfill({status:503,json:{error:{code:'CONTENT_UNAVAILABLE',message:'The free-reading sources aren’t answering just now.'},sources:[{id:'gutenberg',status:'timeout',returned:0},{id:'open-textbook-library',status:'unavailable',returned:0}]}});
    if(endpoint==='search')return route.fulfill({json:reviewResponse(state,body)});
    if(endpoint==='locate')return route.fulfill({json:{items:[{...reviewBook(),match:{scheme:'isbn13',value:BOOK.isbn13}}]}});
    const item=[reviewBook(),reviewBook(158,'Emma'),reviewBook(105,'Persuasion'),reviewPreprint(),reviewPaper(),...['en','hi','ta'].map(reviewStory)].find(item=>item.key===body.key)||reviewBook();
    return route.fulfill({json:{item}});
  });
  return calls;
}
export async function openReviewState(page,state,origin) {
  const papers=['PaperResults','PaperDetail','SourcesSheet','Loading','PartialCoverage','BudgetUsed'].includes(state);
  const path=state==='FreeStart'?'/app/search?scope=free':state==='LibraryBookFreeEdition'?'/app/books/'+encodeURIComponent(BOOK.bookKey)
    :'/app/search?'+new URLSearchParams({scope:papers?'papers':'free',...state==='ChildrensPilot'?{collection:'children'}:{q:papers?'synthetic paper review':'jane austen'}});
  await page.goto(origin+path);
  if(state==='FreeStart'){
    await page.getByLabel('Search free books',{exact:true}).fill('jane austen');await page.getByRole('button',{name:'Search',exact:true}).click();
    await page.locator('.content-result').first().waitFor();await page.getByLabel('Search free books',{exact:true}).fill('');await page.getByRole('button',{name:'Search',exact:true}).click();
    await page.getByRole('heading',{name:'Recent free searches'}).waitFor();
  }else if(state==='SourcesSheet'){
    await page.getByRole('button',{name:'Sources',exact:true}).click();await page.getByRole('dialog').waitFor();
  }else if(state==='Loading')await page.getByText('Waiting its turn',{exact:true}).waitFor();
  else if(state==='SourcesDown')await page.getByRole('alert').waitFor();
  else if(state==='NoFreeCopy')await page.getByRole('heading',{name:'No verified free copy in these results'}).waitFor();
  else if(state==='LibraryBookFreeEdition')await page.getByRole('heading',{name:'Also free to read'}).waitFor();
  else {
    await page.locator('.content-result').first().waitFor();
    if(state==='DeskFreeSearch'){await page.getByRole('button',{name:'Show them, labelled'}).click();await page.getByRole('heading',{name:'Unclear access',exact:true}).waitFor();}
    if(['FreeBookDetail','PaperDetail','DeskFreeSearch'].includes(state)){
      await page.locator('.content-result h2 a').first().click();await page.locator('.content-read').waitFor();
    }
  }
  await page.evaluate(()=>document.fonts.ready);
}
