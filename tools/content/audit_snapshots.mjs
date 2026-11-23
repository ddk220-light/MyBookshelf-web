import {readFileSync} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createLocalContentService} from '../../server/services/content/localCatalog.js';
const directory=process.argv[2]||'server/data/content';
const snapshots=['gutenberg','open-textbook-library','bookdash'].map(source=>JSON.parse(readFileSync(path.join(directory,source+'.json'),'utf8')));
const service=createLocalContentService({enabled:true,cursorSecret:randomBytes(32).toString('hex'),loadSnapshot:()=>snapshots});
const report=[];
for(const snapshot of snapshots){
  let readable=0;
  for(const record of snapshot.records){
    const item=service.resolve({key:record.key}).item;
    if(item.readingActions.length)readable++;
  }
  if(!readable)throw Error('Snapshot has no current source reading evidence: '+snapshot.sourceId);
  const query=snapshot.records[0].title.replace(/[\u0000-\u001f]/g,' ').slice(0,100);
  const page=service.search({query,kinds:[snapshot.records[0].kind],limit:1});
  if(!page.sources.some(source=>source.id===snapshot.sourceId&&source.status==='ok'))throw Error('Snapshot was not indexed');
  report.push({sourceId:snapshot.sourceId,records:snapshot.recordCount,readable,complete:snapshot.complete,importedAt:snapshot.importedAt});
}
console.log(JSON.stringify(report));
