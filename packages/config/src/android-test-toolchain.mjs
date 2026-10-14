import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { androidBuildManifestDigest } from './android-build-contract.mjs';

const exec=promisify(execFile), tools=['flutter','java','node','pnpm'];
const fileSha=async path=>{
 const h=createHash('sha256');
 for await(const chunk of createReadStream(path))h.update(chunk);
 return h.digest('hex');
};
const sha40=/^[0-9a-f]{40}$/, sha64=/^[0-9a-f]{64}$/;
const strict=(v,names)=>v && typeof v==='object' && !Array.isArray(v) &&
 Object.keys(v).sort().join(',')===names.slice().sort().join(',');
const fail=msg=>{throw new Error(msg);};

/**
 * Local TEST-only toolchain byte/version verification, not runner auth,
 * full SDK attestation, build permission or a signed-artifact check.
 * Expected pins MUST come from an independently authenticated runner policy,
 * never from a partner, request or unsigned build manifest. --version
 * executes programs, therefore the caller MUST already be sandboxed.
 */
export async function verifyPinnedTestAndroidToolchain(plan,checkout,pins) {
 const m=plan?.manifest;
 if(!plan || plan.testOnly!==true || plan.dispatchAllowed!==false ||
    plan.requiresVersionReservation!==true || !m || m.buildMode!=='TEST' ||
    !['RESIDENT','GUARD'].includes(m.appRole) ||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase() ||
    !sha40.test(m.sourceSha) || !sha64.test(m.lockDigest) ||
    plan.manifestDigest!==androidBuildManifestDigest(m))
  fail('Invalid non-dispatchable TEST toolchain plan');
 if(!checkout || checkout.testOnly!==true || checkout.dispatchAllowed!==false ||
    checkout.checkoutVerified!==true || checkout.checkoutClean!==true ||
    checkout.runnerAuthenticated!==false ||
    checkout.manifestDigest!==plan.manifestDigest ||
    checkout.sourceSha!==m.sourceSha || checkout.lockDigest!==m.lockDigest ||
    checkout.appRole!==m.appRole)
  fail('Unverified TEST source checkout');
 if(!strict(pins,['executables','sha256','versions']) ||
    !strict(pins.executables,tools) || !strict(pins.sha256,tools) ||
    !strict(pins.versions,tools))
  fail('Missing independently pinned toolchain inventory');
 const v=pins.versions;
 if(v.flutter!=='3.47.0' || v.java!=='17' ||
    typeof v.node!=='string' || !/^22\.\d+\.\d+$/.test(v.node) ||
    v.pnpm!=='10.15.0')
  fail('Unsupported TEST toolchain version');
 for(const tool of tools){
  const p=pins.executables[tool],s=pins.sha256[tool];
  if(typeof p!=='string' || !isAbsolute(p) || resolve(p)!==p ||
     typeof s!=='string' || !sha64.test(s))
   fail('Invalid pinned TEST executable location/hash');
 }
 const env=Object.fromEntries(['PATH','HOME','LANG','TMPDIR']
  .filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]));
 env.LANG='C';env.LC_ALL='C';
 const args={flutter:['--version','--machine'],java:['-version'],
  node:['--version'],pnpm:['--version']};
 const receipts={};
 for(const tool of tools){
  const path=pins.executables[tool],stat=await lstat(path);
  if(await realpath(path)!==path || !stat.isFile() || stat.isSymbolicLink() ||
     stat.size<1 || stat.size>384*1024*1024 || !(stat.mode & 0o111))
   fail('Untrusted TEST executable type or link');
  const before=await fileSha(path);
  if(before!==pins.sha256[tool]) fail('TEST executable does not match independent SHA pin');
  const {stdout,stderr}=await exec(path,args[tool],{
   env,timeout:7000,maxBuffer:32768,encoding:'utf8',windowsHide:true
  });
  const out=(stdout+'\n'+stderr).trim();
  if(out.length>12000)fail('Unexpectedly large version output');
  let observed;
  if(tool==='flutter'){
   let result;try{result=JSON.parse(stdout.trim());}catch{fail('Invalid Flutter version JSON');}
   observed=result?.frameworkVersion;
   if(result?.channel!=='stable')fail('Flutter channel is not stable');
  }else if(tool==='java'){
   observed=/(?:openjdk|java) version "(\d+)(?:\.\d+)*[^"]*"/.exec(out)?.[1];
  }else if(tool==='node'){
   observed=/^v(\d+\.\d+\.\d+)$/.exec(stdout.trim())?.[1];
  }else{
   observed=/^(\d+\.\d+\.\d+)$/.exec(stdout.trim())?.[1];
  }
  if(observed!==v[tool])fail('TEST executable version differs from independent pin');
  if(await fileSha(path)!==before)fail('TEST executable modified during version check');
  receipts[tool]=Object.freeze({version:observed,sha256:before});
 }
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  manifestDigest:plan.manifestDigest,sourceSha:m.sourceSha,
  lockDigest:m.lockDigest,appRole:m.appRole,
  executableChecksPassed:true,reportedVersionsMatched:true,
  verifiedExecutables:Object.freeze(receipts),
  runnerAuthenticated:false,flutterSdkTreeVerified:false,androidSdkVerified:false,
  nativeWrapperVerified:false,signerVerified:false,archiveVerified:false,
  artifactProduced:false,dispatchAllowed:false,
  requiresAuthenticatedRunner:true,requiresSdkAndTemplateVerification:true
 });
}
