import {readFileSync,statSync} from 'node:fs';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {CONTENT_POLICY_REVISION,parseContentKey,parseContentSearch,parseContentResolve,safeWebUrl,observedAccess,readingActions,isReadableAccess} from './contracts.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function unavailable(reason){return Object.assign(Error('The reviewed children’s starter set is not ready yet.'),
  {code:'CONTENT_COLLECTION_UNAVAILABLE',status:503,validationReason:reason});}
function validText(value,max=500){return typeof value==='string'&&Boolean(value.trim())&&value.length<=max&&!/[\u0000-\u001f]/.test(value);}
function onlyFields(value,fields){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>fields.includes(key));}
function storyUrl(value,id){
  const url=safeWebUrl(value);if(!url)return false;
  const parsed=new URL(url),match=/^\/(?:en\/)?stories\/([1-9]\d{0,8})(?:-[^/]+)?\/?$/.exec(parsed.pathname);
  return parsed.hostname==='storyweaver.org.in'&&match?.[1]===id;
}
export function readChildrenManifest(){
  const path=new URL('../../data/content/children-pilot.json',import.meta.url);
  if(statSync(path).size>128*1024)throw unavailable('Manifest exceeds limit');
  return JSON.parse(readFileSync(path,'utf8'));
}

export function validateChildrenManifest(manifest,{now=Date.now()}={}){
  const fail=reason=>{throw unavailable(reason);};
  if(!onlyFields(manifest,['schemaVersion','collectionId','status','records'])||manifest.schemaVersion!==1||manifest.collectionId!=='children'||manifest.status!=='reviewed'
    ||!Array.isArray(manifest.records)||!manifest.records.length||manifest.records.length>30||Buffer.byteLength(JSON.stringify(manifest))>128*1024)fail('A reviewed nonempty bounded manifest is required');
  const keys=new Set(),languages=new Set();
  const fields=['key','title','contributors','language','originalLanguage','originalStoryKey','publisher','readingLevel','license','readerUrl','recordUrl','access','review'];
  return manifest.records.map(record=>{
    if(!record||Object.keys(record).some(key=>!fields.includes(key)))fail('Only reviewed metadata fields are allowed');
    const parsed=parseContentKey(record.key),id=parsed?.recordId;
    if(parsed?.sourceId!=='storyweaver'||keys.has(record.key))fail('Distinct source-native StoryWeaver IDs are required');keys.add(record.key);
    if(!['en','hi','ta'].includes(record.language)||!validText(record.originalLanguage,30)||record.originalLanguage==='und'||! /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(record.originalLanguage)||!validText(record.title)||!validText(record.publisher,150))fail('Explicit pilot language/title/publisher required');languages.add(record.language);
    if(!onlyFields(record.readingLevel,['label','publisher'])||!validText(record.readingLevel.label,100)||record.readingLevel.publisher!==record.publisher)fail('Publisher-labelled level required');
    const credits=record.contributors;
    if(!Array.isArray(credits)||credits.length>30||credits.some(c=>!onlyFields(c,['name','role'])||!validText(c.name,240)||!['author','illustrator','translator','editor'].includes(c.role))
      ||!credits.some(c=>c.role==='author')||!credits.some(c=>c.role==='illustrator')
      ||record.language!==record.originalLanguage&&!credits.some(c=>c.role==='translator'))fail('Complete original contributor roles required');
    if(!storyUrl(record.readerUrl,id)||!storyUrl(record.recordUrl,id))fail('Exact original reading/metadata URLs required');
    if(!onlyFields(record.license,['id','url','statement'])||record.license.id!=='CC-BY-4.0'||record.license.url!=='https://creativecommons.org/licenses/by/4.0/'||!validText(record.license.statement))fail('Per-record supported licence evidence required');
    const access=record.access||'free_full_text';
    if(!isReadableAccess(access))fail('Only verified no-cost reading conditions are supported');
    const accountRequired=access==='free_account_required';
    const review=record.review,stamp=Date.parse(review?.reviewedAt);
    if(!onlyFields(review,['reviewedBy','reviewedAt','noLogin','publicFullText','freeAccount','fullTextOffered','postLoginReadingVerified','accountNoticeUrl','rightsPolicyUrl','creditsUrl','languageUrl','levelUrl','rightsUrl','readingUrl'])||!validText(review.reviewedBy,150)||!Number.isFinite(stamp)||stamp>now+300000
      ||['creditsUrl','languageUrl','levelUrl','rightsUrl','readingUrl'].some(field=>!storyUrl(review[field],id)))fail('Complete dated source review is required');
    if(accountRequired){
      if(review.noLogin!==false||review.publicFullText!==false||review.freeAccount!==true||review.fullTextOffered!==true
        ||typeof review.postLoginReadingVerified!=='boolean'||!storyUrl(review.accountNoticeUrl,id)
        ||review.rightsPolicyUrl!=='https://storyweaver.org.in/en/open-content')fail('Free source account and book-policy evidence required');
    }else if(review.noLogin!==true||review.publicFullText!==true)fail('Anonymous full reading evidence required');
    const original=record.originalStoryKey&&manifest.records.find(item=>item.key===record.originalStoryKey);
    if(record.originalStoryKey&&(!original||original.key===record.key||original.language!==record.originalLanguage))fail('Original translation identity must name a reviewed source record');
    return {key:record.key,kind:'book',title:record.title,contributors:credits,languages:[record.language],
      identifiers:[{scheme:'storyweaver',value:id}],subjects:['Children’s stories'],collections:['children'],
      publisher:record.publisher,readingLevel:record.readingLevel,originalLanguage:record.originalLanguage,
      relations:original?[{kind:'translation_of',targetKey:original.key,evidence:'Reviewed source originalStory.id and original language'}]:[],
      locations:[{id:'storyweaver:'+id,host:'StoryWeaver',landingUrl:record.recordUrl,readerUrl:record.readerUrl,downloads:[],
        access,license:record.license,evidence:{sourceId:'storyweaver',field:accountRequired?'Reviewed book metadata, free-account reading offer and book licence policy':'Reviewed anonymous full reading + per-record licence',observedAt:review.reviewedAt}}],
      provenance:[{sourceId:'storyweaver',sourceRecordId:id,recordUrl:record.recordUrl,retrievedAt:review.reviewedAt,mappingVersion:'reviewed-children-v1'}]};
  }).map((item,index,all)=>{
    if(index===all.length-1&&!['en','hi','ta'].every(language=>languages.has(language)))fail('Reviewed English, Hindi and Tamil records are all required');
    return item;
  });
}

export function createChildrenService({enabled=process.env.CONTENT_CHILDREN_ENABLED==='true',cursorSecret=process.env.CONTENT_CURSOR_SECRET,
  loadManifest=readChildrenManifest,now=()=>Date.now()}={}){
  let records,revision;
  function ensure(){
    if(!enabled)throw unavailable('Collection flag is off');
    if(typeof cursorSecret!=='string'||cursorSecret.length<32)throw unavailable('Cursor signing is not configured');
    if(records)return;
    records=validateChildrenManifest(loadManifest(),{now:now()}).sort((a,b)=>a.key.localeCompare(b.key));revision=hash(records);
  }
  function present(item,context){return {...item,access:observedAccess(item.locations[0],{...context,now:now()}),readingActions:readingActions(item,{...context,now:now()})};}
  function sign(payload){return createHmac('sha256',cursorSecret).update(payload).digest('base64url');}
  function expired(){return Object.assign(Error('This collection search changed or expired. Start again.'),{code:'CONTENT_CURSOR_EXPIRED',status:409});}
  return {
    search(input){
      const query=parseContentSearch(input);ensure();
      if(query.collection!=='children'||!query.kinds.includes('book')||query.sourceIds||query.retrySource)throw Object.assign(Error('Choose the children’s collection without paper filters.'),{code:'CONTENT_FILTER_UNSUPPORTED',status:400});
      const binding=hash({...query,cursor:null,revision,policy:CONTENT_POLICY_REVISION});let offset=0,expires=now()+900000;
      if(query.cursor){try{
        const [payload,mac,extra]=query.cursor.split('.');
        if(extra||!/^[A-Za-z0-9_-]{43}$/.test(mac||'')||!timingSafeEqual(Buffer.from(mac),Buffer.from(sign(payload))))throw expired();
        const state=JSON.parse(Buffer.from(payload,'base64url').toString());
        if(state.binding!==binding||state.expires<=now()||!Number.isInteger(state.offset)||state.offset<0||state.offset>30)throw expired();
        ({offset,expires}=state);
      }catch{throw expired();}}
      const terms=query.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const matching=records.filter(item=>(!query.languages.length||query.languages.includes(item.languages[0]))
        &&(!query.level||item.readingLevel.label===query.level)
        &&terms.every(term=>[item.title,...item.contributors.map(c=>c.name)].join(' ').toLocaleLowerCase().includes(term))).map(item=>present(item,query));
      const hiddenUnclear=matching.filter(item=>item.access==='unknown').length;
      const eligible=matching.filter(item=>isReadableAccess(item.access)?query.access!=='free_full_text'||item.access==='free_full_text':query.includeUnclear&&item.access==='unknown');const items=eligible.slice(offset,offset+query.limit);
      const payload=Buffer.from(JSON.stringify({binding,offset:offset+items.length,expires})).toString('base64url');
      return {items,hiddenUnclear,nextCursor:offset+items.length<eligible.length?payload+'.'+sign(payload):null,coverage:'partial',policyRevision:CONTENT_POLICY_REVISION,
        availableLevels:[...new Set(records.map(item=>item.readingLevel.label))],
        sources:[{id:'children-pilot',name:'Reviewed children’s starter set',status:'ok',returned:items.length,catalogRecords:records.length,complete:false,
          freshness:records.some(item=>now()-Date.parse(item.provenance[0].retrievedAt)>86400000)?'stale':'fresh'}]};
    },
    resolve(input){
      const request=parseContentResolve(input);ensure();const item=records.find(item=>item.key===request.key);
      if(!item)throw Object.assign(Error('This story is not in the reviewed starter set.'),{code:'CONTENT_NOT_FOUND',status:404});
      return {item:present(item,request),policyRevision:CONTENT_POLICY_REVISION};
    },
  };
}
