// Match the web service's dependency boundary instead of relying on a root
// install that also happens to contain every API package.
import {cpSync,copyFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../../',import.meta.url));
const target=mkdtempSync(join(tmpdir(),'mybookshelf-client-service-'));
const excluded=new Set(['node_modules','dist','test-results','playwright-report','__pycache__','.git','.vercel']);
function run(args){
  const result=spawnSync('npm',args,{cwd:target,stdio:'inherit',timeout:180000});
  if(result.error||result.status!==0)throw Error('Isolated client service command failed');
}
try{
  for(const file of ['package.json','package-lock.json'])copyFileSync(join(root,file),join(target,file));
  for(const directory of ['client','server','shared','tools','data'])cpSync(join(root,directory),join(target,directory),{
    recursive:true,filter:source=>!excluded.has(basename(source))&&!/^\.env(?:\.|$)/.test(basename(source)),
  });
  run(['ci','--workspace=client','--ignore-scripts','--include=dev']);
  if(existsSync(join(target,'node_modules/express')))throw Error('Boundary check unexpectedly installed the API dependency graph');
  run(['run','build','--workspace=client']);
  if(!existsSync(join(target,'client/dist/app/index.html')))throw Error('Isolated build did not generate the app');
  console.log('Isolated client-only service build passed without Express/API dependencies.');
}finally{rmSync(target,{recursive:true,force:true});}
