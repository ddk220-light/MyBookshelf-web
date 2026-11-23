// Match the web service's dependency boundary instead of relying on a root
// install that also happens to contain every API package.
import {cpSync,copyFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {FAKE_BUILD_ENV,findBundleLeaks} from './client-bundle-env.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const target=mkdtempSync(join(tmpdir(),'mybookshelf-client-service-'));
const excluded=new Set(['node_modules','dist','test-results','playwright-report','__pycache__','.git','.vercel']);
function run(args,env=process.env){
  const result=spawnSync('npm',args,{cwd:target,stdio:'inherit',timeout:180000,env});
  if(result.error||result.status!==0)throw Error('Isolated client service command failed');
}
try{
  for(const file of ['package.json','package-lock.json'])copyFileSync(join(root,file),join(target,file));
  // docs/policy: the app and the public /privacy and /terms pages render the policy texts at build time.
  for(const directory of ['client','server','shared','tools','data','docs/policy'])cpSync(join(root,directory),join(target,directory),{
    recursive:true,filter:source=>!excluded.has(basename(source))&&!/^\.env(?:\.|$)/.test(basename(source)),
  });
  run(['ci','--workspace=client','--ignore-scripts','--include=dev']);
  if(existsSync(join(target,'node_modules/express')))throw Error('Boundary check unexpectedly installed the API dependency graph');
  // Build as Vercel does, with its system variables (also VITE_-prefixed), and
  // fail if any of them reached the bundle (client-bundle-env.mjs).
  run(['run','build','--workspace=client'],{...process.env,...FAKE_BUILD_ENV});
  if(!existsSync(join(target,'client/dist/app/index.html')))throw Error('Isolated build did not generate the app');
  const leaks=findBundleLeaks(join(target,'client/dist'),{fakeValues:true});
  if(leaks.length)throw Error('Client bundle contains build-host variables: '+leaks.map(({file,needle})=>`${file} ${JSON.stringify(needle)}`).join(', '));
  console.log('Isolated client-only service build passed without Express/API dependencies.');
}finally{rmSync(target,{recursive:true,force:true});}
