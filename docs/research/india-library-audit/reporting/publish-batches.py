"""Publish immutable research snapshots through the configured GitHub MCP host.

This only updates the temporary branch. A caller must separately promote its
verified head with a non-forced expected-SHA update while holding the edit lease.
No credential is sent anywhere except its configured MCP endpoint.
"""
import os,sys,json,pathlib,subprocess,datetime,hashlib,urllib.request,argparse
ENDPOINT='https://api.githubcopilot.com/mcp/'
REPO='/workspace/MyBookshelf-web-india-library-audit'
OWNER='ddk220-light';NAME='MyBookshelf-web'
def rpc(name,args):
 token=os.environ.get('GH_PROJECT_TOKEN')
 if not token:raise RuntimeError('Configured GitHub MCP binding unavailable')
 payload={'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}}
 data=json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode()
 request=urllib.request.Request(ENDPOINT,data=data,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json, text/event-stream'})
 with urllib.request.urlopen(request,timeout=120) as response:raw=response.read().decode()
 obj=json.loads(raw) if not raw.startswith('event:') else json.loads([line[6:] for line in raw.splitlines() if line.startswith('data: ')][-1])
 if obj.get('error'):raise RuntimeError(str(obj['error']))
 result=obj['result']
 if result.get('isError'):raise RuntimeError(json.dumps(result)[:1500])
 if result.get('structuredContent'):return result['structuredContent']
 return json.loads(next(c['text'] for c in result['content'] if c['type']=='text'))
def git(*args,data=None,index=None):
 env=os.environ.copy()
 if index:env['GIT_INDEX_FILE']=str(index)
 return subprocess.check_output(['git',*args],cwd=REPO,env=env,input=data)
def info(ref):return rpc('get_commit',{'owner':OWNER,'repo':NAME,'sha':ref,'detail':'none'})
def save(path,state):
 temp=path.with_suffix('.tmp');temp.write_text(json.dumps(state,indent=2)+'\n');temp.replace(path)
def store_commit(sha,tree,parent,metadata):
 commit=metadata['commit']
 def actor(key):
  actor=commit[key];dt=datetime.datetime.fromisoformat(actor['date'].replace('Z','+00:00'))
  return f"{actor['name']} <{actor['email']}> {int(dt.timestamp())} +0000"
 header=f"tree {tree}\nparent {parent}\nauthor {actor('author')}\ncommitter {actor('committer')}\n\n"
 for ending in ['', '\n']:
  body=(header+commit['message']+ending).encode()
  if git('hash-object','-t','commit','--stdin',data=body).decode().strip()==sha:
   assert git('hash-object','-w','-t','commit','--stdin',data=body).decode().strip()==sha
   return
 raise RuntimeError('Remote commit did not match the exact local tree, expected parent and reported metadata; do not promote')
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--snapshot',required=True);ap.add_argument('--base',required=True);ap.add_argument('--branch',required=True);ap.add_argument('--cursor',required=True);ap.add_argument('--max-bytes',type=int,default=6000000);args=ap.parse_args()
 cursor=pathlib.Path(args.cursor);index=cursor.with_suffix('.index')
 if cursor.exists():
  state=json.loads(cursor.read_text());assert state['snapshot']==args.snapshot and state['base']==args.base and state['branch']==args.branch
 else:
  assert info('feat/library-connector-audit')['sha']==args.base,'Main audit branch changed'
  assert info(args.branch)['sha']==args.base,'Temporary branch changed'
  changed=git('diff','--name-only','--no-renames',args.base,args.snapshot).decode().splitlines();assert not git('diff','--name-only','--diff-filter=D',args.base,args.snapshot).strip()
  files=[]
  for path in changed:
   mode,kind,sha=git('ls-tree',args.snapshot,'--',path).decode().split('\t')[0].split();assert mode=='100644' and kind=='blob','MCP file writer cannot preserve this mode'
   content=git('cat-file','blob',sha).decode('utf8');size=len(json.dumps({'path':path,'content':content},ensure_ascii=False).encode());files.append({'path':path,'sha':sha,'size':size})
  files.sort(key=lambda f:f['size']);batches=[];batch=[];size=0
  for entry in files:
   if batch and size+entry['size']>args.max_bytes:batches.append(batch);batch=[];size=0
   batch.append(entry);size+=entry['size']
  if batch:batches.append(batch)
  state={'schemaVersion':1,'snapshot':args.snapshot,'base':args.base,'branch':args.branch,'batches':batches,'completed':[],'inflight':None};save(cursor,state)
 git('read-tree',args.base,index=index)
 for entry in state['completed']:
  for file in state['batches'][entry['batch']]:git('update-index','--add','--cacheinfo','100644',file['sha'],file['path'],index=index)
 parent=state['completed'][-1]['sha'] if state['completed'] else args.base
 for number in range(len(state['completed']),len(state['batches'])):
  batch=state['batches'][number]
  for file in batch:git('update-index','--add','--cacheinfo','100644',file['sha'],file['path'],index=index)
  tree=git('write-tree',index=index).decode().strip();observed=info(args.branch)
  if observed['sha']!=parent:
   if state.get('inflight') and state['inflight']['batch']==number:
    store_commit(observed['sha'],tree,parent,observed);sha=observed['sha']
   else:raise RuntimeError('Another temporary-branch writer changed the head')
  else:
   files=[{'path':f['path'],'content':git('cat-file','blob',f['sha']).decode('utf8')} for f in batch]
   state['inflight']={'batch':number,'parent':parent,'tree':tree};save(cursor,state)
   print(json.dumps({'phase':'uploading','batch':number+1,'batches':len(state['batches']),'files':len(files),'encodedBytes':sum(f['size'] for f in batch)}),flush=True)
   result=rpc('push_files',{'owner':OWNER,'repo':NAME,'branch':args.branch,'message':f"Save India audit evidence checkpoint ({number+1}/{len(state['batches'])}) [skip ci] [skip vercel]",'files':files});sha=result['object']['sha']
   metadata=info(sha);store_commit(sha,tree,parent,metadata)
  state['completed'].append({'batch':number,'sha':sha,'parent':parent,'tree':tree});state['inflight']=None;save(cursor,state);parent=sha
  print(json.dumps({'phase':'verified_batch','batch':number+1,'sha':sha,'tree':tree}),flush=True)
 expected=git('rev-parse',args.snapshot+'^{tree}').decode().strip();actual=git('rev-parse',parent+'^{tree}').decode().strip();assert expected==actual,'Complete snapshot tree mismatch'
 state['verifiedHead']=parent;state['verifiedTree']=actual;save(cursor,state)
 print(json.dumps({'phase':'ready_for_nonforced_promotion','head':parent,'tree':actual,'sourceSnapshot':args.snapshot}),flush=True)
if __name__=='__main__':main()
