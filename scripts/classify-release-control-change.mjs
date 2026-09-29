import { execFileSync } from 'node:child_process';

const [baseSha,headSha]=process.argv.slice(2);
if(!baseSha||!headSha){
  console.error('Usage: node scripts/classify-release-control-change.mjs <base-sha> <head-sha>');
  process.exit(2);
}

const changed=execFileSync('git',['diff','--name-only',baseSha,headSha],{encoding:'utf8'})
  .split('\n').map(value=>value.trim()).filter(Boolean);

const allowedPath=(path)=>
  path==='.github/workflows/ci.yml' ||
  path==='scripts/check-required-merge-gates.mjs' ||
  path==='scripts/classify-release-control-change.mjs' ||
  path.startsWith('docs/');

if(changed.length===0||changed.some(path=>!allowedPath(path))){
  console.log('false');
  process.exit(0);
}

const ciChanged=changed.includes('.github/workflows/ci.yml');
if(!ciChanged){
  console.log('true');
  process.exit(0);
}

const show=(sha,path)=>execFileSync('git',['show',sha+':'+path],{encoding:'utf8'}).replace(/\r\n/g,'\n');

function stripJob(source,job){
  const marker='\n  '+job+':\n';
  const start=source.indexOf(marker);
  if(start<0)throw new Error('CI job missing: '+job);
  const restStart=start+marker.length;
  const next=source.slice(restStart).search(/\n  [a-z0-9][a-z0-9-]*:\n/);
  const end=next<0?source.length:restStart+next;
  return source.slice(0,start)+'\n  __RELEASE_CONTROL_'+job.toUpperCase().replaceAll('-','_')+'__:\n'+source.slice(end);
}

function nonControl(source){
  let value=source;
  for(const job of ['change-scope','dependency-security-full','dependency-security','develop-auto-merge']) value=stripJob(value,job);
  return value.replace(/\n{3,}/g,'\n\n').trim();
}

try{
  const base=nonControl(show(baseSha,'.github/workflows/ci.yml'));
  const head=nonControl(show(headSha,'.github/workflows/ci.yml'));
  console.log(base===head?'true':'false');
}catch(error){
  console.error(error instanceof Error?error.message:String(error));
  console.log('false');
}
