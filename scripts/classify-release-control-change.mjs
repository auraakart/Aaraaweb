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
  path==='.github/workflows/backup-restore-smoke.yml' ||
  path==='scripts/check-required-merge-gates.mjs' ||
  path==='scripts/classify-release-control-change.mjs' ||
  /^scripts\/check-v4\.79[0-9A-Za-z._-]*\.mjs$/.test(path) ||
  path.startsWith('docs/');

if(changed.length===0||changed.some(path=>!allowedPath(path))){
  console.log('false');
  process.exit(0);
}

const ciChanged=changed.includes('.github/workflows/ci.yml');
const backupChanged=changed.includes('.github/workflows/backup-restore-smoke.yml');

const show=(sha,path)=>execFileSync('git',['show',sha+':'+path],{encoding:'utf8'}).replace(/\r\n/g,'\n');

function stripJob(source,job,label='workflow'){
  const marker='\n  '+job+':\n';
  const start=source.indexOf(marker);
  if(start<0)throw new Error(label+' job missing: '+job);
  const restStart=start+marker.length;
  const next=source.slice(restStart).search(/\n  [a-z0-9][a-z0-9-]*:\n/);
  const end=next<0?source.length:restStart+next;
  return source.slice(0,start)+'\n  __RELEASE_CONTROL_'+job.toUpperCase().replaceAll('-','_')+'__:\n'+source.slice(end);
}

function nonControlCi(source){
  let value=source;
  for(const job of ['change-scope','dependency-security-full','dependency-security','develop-auto-merge']) value=stripJob(value,job,'CI');
  return value.replace(/\n{3,}/g,'\n\n').trim();
}

function nonControlBackup(source){
  return stripJob(source,'change-scope','Backup restore').replace(/\n{3,}/g,'\n\n').trim();
}

try{
  let safe=true;
  if(ciChanged){
    safe=safe&&nonControlCi(show(baseSha,'.github/workflows/ci.yml'))===nonControlCi(show(headSha,'.github/workflows/ci.yml'));
  }
  if(backupChanged){
    safe=safe&&nonControlBackup(show(baseSha,'.github/workflows/backup-restore-smoke.yml'))===nonControlBackup(show(headSha,'.github/workflows/backup-restore-smoke.yml'));
  }
  console.log(safe?'true':'false');
}catch(error){
  console.error(error instanceof Error?error.message:String(error));
  console.log('false');
}
