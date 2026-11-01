// Test tooling only: no production imports. Pass large cache values on stdin,
// rather than hitting the operating system's ~128 KiB single-argument limit.
import {execFile} from 'node:child_process';

export async function redisTestCommand(container,args){
  if(!/^mybookshelf-free-content-test-[a-z0-9-]+$/.test(container))throw Error('REFUSING_NONTEST_CONTAINER');
  let command=args.map(String),input;
  if(command[0]==='EVAL'){
    const count=Number(command[2]);
    if(!Number.isInteger(count)||count<0)throw Error('INVALID_TEST_COMMAND');
    const lua='local payload=cjson.decode(ARGV[1]); local function command(KEYS,ARGV)\n'+command[1]+'\nend; return command(payload.keys,payload.args)';
    input=JSON.stringify({keys:command.slice(3,3+count),args:command.slice(3+count)});
    command=['-x','EVAL',lua,'0'];
  }
  const stdout=await new Promise((resolve,reject)=>{
    const child=execFile('docker',['exec',...(input?['-i']:[]),container,'redis-cli','--json',...command],{maxBuffer:4*1024*1024},(error,stdout)=>{
      if(error)reject(Error('Test Redis command failed.'));else resolve(stdout);
    });
    if(input)child.stdin.end(input);
  });
  return JSON.parse(stdout);
}
